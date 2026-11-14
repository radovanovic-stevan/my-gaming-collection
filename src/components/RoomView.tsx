import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE_NS from 'three';
import type { Game } from '../types';
import { planRoom, UNIT, type RoomPlan, type Stop } from '../lib/room';
import { buildScene, PER_SHEET } from '../lib/roomScene';
import { coverUrl, formatDate } from '../lib/format';
import { Cover } from './Cover';
import { PlatformBadge, RatingBadge, StatusBadge } from './Badges';

interface Props {
  games: Game[];
  onOpen: (game: Game) => void;
}

const EYE = 1.62;
/** Eye height crouched, which is what it takes to read the bottom shelf. */
const CROUCH = 0.95;
const WALK = 2.4;
const RUN = 4.4;
/** How close you can get to a bookcase before it stops you. */
const BODY = 0.34;
const PITCH = Math.PI / 2 - 0.05;

const keyFor = (code: string) =>
  ({ KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' })[code];

/** The run of bookcases, as one footprint you can't walk through. */
function blockers(plan: RoomPlan): [number, number, number, number][] {
  if (!plan.units.length) return [];
  const first = plan.units[0];
  const last = plan.units[plan.units.length - 1];
  return [[first.x - UNIT.width / 2, last.x + UNIT.width / 2, first.z - UNIT.depth / 2, first.z + UNIT.depth / 2]];
}

/** Keeps the walker inside the room and out of the furniture, pushing back along whichever axis is shallower. */
function collide(x: number, z: number, plan: RoomPlan, rects: [number, number, number, number][]) {
  let px = Math.max(-plan.room.width / 2 + BODY, Math.min(plan.room.width / 2 - BODY, x));
  let pz = Math.max(-plan.room.depth / 2 + BODY, Math.min(plan.room.depth / 2 - BODY, z));
  for (const [x0, x1, z0, z1] of rects) {
    if (px < x0 - BODY || px > x1 + BODY || pz < z0 - BODY || pz > z1 + BODY) continue;
    const left = px - (x0 - BODY);
    const right = x1 + BODY - px;
    const near = pz - (z0 - BODY);
    const far = z1 + BODY - pz;
    const least = Math.min(left, right, near, far);
    if (least === left) px = x0 - BODY;
    else if (least === right) px = x1 + BODY;
    else if (least === near) pz = z0 - BODY;
    else pz = z1 + BODY;
  }
  return [px, pz] as const;
}

/**
 * The collection as a room you walk through: every box on a shelf, platform by platform, at its real size.
 * Three.js and the whole scene are only loaded once this tab is opened.
 */
export default function RoomView({ games, onOpen }: Props) {
  const plan = useMemo(() => planRoom(games), [games]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hover, setHoverName] = useState<string | null>(null);
  const [picked, setPicked] = useState<Game | null>(null);
  const [here, setHere] = useState<Stop | null>(null);
  const [shown, setShown] = useState<{ title: string; note: string; games: Game[] } | null>(null);
  const [locked, setLocked] = useState(false);
  const touch = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  /** Set by the scene, called by the HUD. */
  const api = useRef<{ goTo: (stop: Stop) => void; putBack: () => void; crouch: () => void } | null>(null);

  useEffect(() => {
    let live = true;
    let frame = 0;
    const cleanup: (() => void)[] = [];

    (async () => {
      const three = await import('three');
      const el = canvas.current;
      if (!live || !el) return;

      let renderer: THREE_NS.WebGLRenderer;
      try {
        renderer = new three.WebGLRenderer({ canvas: el, antialias: true, powerPreference: 'high-performance' });
      } catch {
        setPhase('error');
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const scene = new three.Scene();
      scene.background = new three.Color(0xe9e7e2);

      const camera = new three.PerspectiveCamera(64, 1, 0.05, 60);

      const built = buildScene(three, scene, plan);
      scene.add(new three.HemisphereLight(0xffffff, 0xd8d4cc, 2.1));
      // Daylight from the side of the room the photograph was taken from, plus a soft fill on the shelves.
      const day = new three.DirectionalLight(0xfff6ea, 1.1);
      day.position.set(plan.room.width / 2, 2.4, plan.room.depth);
      scene.add(day);
      const fill = new three.DirectionalLight(0xeef2ff, 0.5);
      fill.position.set(-plan.room.width / 2, 2.2, plan.room.depth / 2);
      scene.add(fill);

      const outline = new three.LineSegments(
        new three.EdgesGeometry(new three.BoxGeometry(1, 1, 1)),
        new three.LineBasicMaterial({ color: 0xffd98a }),
      );
      outline.visible = false;
      scene.add(outline);

      const rects = blockers(plan);
      const pose = { x: plan.start.x, z: plan.start.z, yaw: plan.start.yaw, pitch: 0 };
      const held = new Set<string>();
      const move = { f: false, b: false, l: false, r: false, fast: false, low: false };
      let eye = EYE;
      const pointer = new three.Vector2(0, 0);
      let aimed = false;
      let touchMove = { x: 0, y: 0 };

      const ray = new three.Raycaster();
      ray.far = 7;
      const targets = () => [...built.labels.map((l) => l.mesh), built.bodies, built.fixtures.mesh];
      /** What the crosshair is on: a box on the shelf, or one of the fixtures that holds several games. */
      type Hit = { game: Game; slot: number } | { fixture: { title: string; note: string; games: Game[] }; slot: -1 } | null;
      const titleOf = (h: Hit) => (!h ? null : 'game' in h ? built.slots[h.slot]?.title ?? h.game.title : h.fixture.title);
      let hit: Hit = null;
      let hitAt = 0;

      /** What the crosshair (or the finger) is on right now. */
      const cast = (): Hit => {
        ray.setFromCamera(pointer, camera);
        const [first] = ray.intersectObjects(targets(), false);
        if (!first || first.faceIndex === undefined || first.faceIndex === null) return null;
        const face = first.faceIndex;
        // Two triangles per label and ten per body: that's how a triangle maps back to a box.
        const sheet = built.labels.findIndex((l) => l.mesh === first.object);
        if (sheet >= 0) {
          const slot = built.labels[sheet].from + Math.floor(face / 2);
          return built.slots[slot] ? { game: built.slots[slot].game, slot } : null;
        }
        if (first.object === built.bodies) {
          const slot = Math.floor(face / 10);
          return built.slots[slot] ? { game: built.slots[slot].game, slot } : null;
        }
        const item = built.fixtures.items[Math.floor(face / 12)];
        if (!item) return null;
        if (item.kind === 'console') {
          const c = plan.consoles[item.index];
          return { fixture: { title: c.name, note: `${c.count} games built in, no boxes to shelve`, games: c.games }, slot: -1 };
        }
        const crate = plan.crates[item.index];
        return {
          fixture: {
            title: `${crate.label} — loose`,
            note: `${crate.games.length} ${crate.games.length === 1 ? 'game' : 'games'} with no case to stand up`,
            games: crate.games,
          },
          slot: -1,
        };
      };

      /** The box that comes off the shelf: its own mesh, with the cover on the face you'd actually look at. */
      let pulled: { mesh: THREE_NS.Mesh; slot: number; t: number; out: boolean; from: THREE_NS.Vector3; yaw: number } | null = null;

      /**
       * Hides a box in place by collapsing its vertices onto a point, so the one in your hands isn't also
       * still on the shelf. Its label is four vertices in a sheet, its other five faces twenty in the body.
       */
      const store = new Map<string, Float32Array>();
      const parts = (slot: number) => [
        { attr: built.labels[Math.floor(slot / PER_SHEET)].mesh.geometry.getAttribute('position') as THREE_NS.BufferAttribute, at: (slot % PER_SHEET) * 4, n: 4 },
        { attr: built.bodies.geometry.getAttribute('position') as THREE_NS.BufferAttribute, at: slot * 20, n: 20 },
      ];
      const collapse = (slot: number, on: boolean) => {
        const where = built.slots[slot];
        parts(slot).forEach((part, i) => {
          const key = `${slot}:${i}`;
          if (on) {
            if (held.has(key)) return;
            const copy = new Float32Array(part.n * 3);
            for (let v = 0; v < part.n; v++) {
              copy[v * 3] = part.attr.getX(part.at + v);
              copy[v * 3 + 1] = part.attr.getY(part.at + v);
              copy[v * 3 + 2] = part.attr.getZ(part.at + v);
              part.attr.setXYZ(part.at + v, where.x, where.y, where.z);
            }
            store.set(key, copy);
          } else {
            const copy = store.get(key);
            if (!copy) return;
            for (let v = 0; v < part.n; v++) part.attr.setXYZ(part.at + v, copy[v * 3], copy[v * 3 + 1], copy[v * 3 + 2]);
            store.delete(key);
          }
          part.attr.needsUpdate = true;
        });
        if (on) held.add(`${slot}`);
        else held.delete(`${slot}`);
      };

      const drop = () => {
        if (!pulled) return;
        pulled.out = false;
      };

      const pull = (index: number) => {
        // Whatever was in hand goes straight back where it came from, rather than being left in limbo.
        if (pulled) {
          collapse(pulled.slot, false);
          scene.remove(pulled.mesh);
          pulled.mesh.geometry.dispose();
          pulled = null;
        }
        const slot = built.slots[index];
        const cover = coverUrl(slot.game);
        const dark = new three.MeshLambertMaterial({ color: 0x15151a });
        const face = new three.MeshLambertMaterial({ color: 0x23232a });
        if (cover) {
          new three.TextureLoader().load(cover, (texture) => {
            texture.colorSpace = three.SRGBColorSpace;
            face.map = texture;
            face.color.set(0xffffff);
            face.needsUpdate = true;
          });
        }
        const upright = slot.flat ? { w: slot.h, h: slot.w, d: slot.d } : { w: slot.w, h: slot.h, d: slot.d };
        const mesh = new three.Mesh(new three.BoxGeometry(upright.w, upright.h, upright.d), [face, dark, dark, dark, dark, dark]);
        mesh.position.set(slot.x, slot.y, slot.z);
        mesh.rotation.y = slot.yaw;
        scene.add(mesh);
        collapse(index, true);
        pulled = { mesh, slot: index, t: 0, out: true, from: mesh.position.clone(), yaw: slot.yaw };
        if (slot.bundle) {
          setShown({ title: slot.title, note: `${slot.bundle.length} games in the one box`, games: slot.bundle });
          setPicked(null);
        } else {
          setShown(null);
          setPicked(slot.game);
        }
      };

      api.current = {
        goTo: (stop) => {
          pose.x = stop.viewX;
          pose.z = stop.viewZ;
          pose.yaw = stop.viewYaw;
          pose.pitch = 0;
          drop();
          setPicked(null);
        },
        putBack: () => {
          drop();
          setPicked(null);
          setShown(null);
        },
        crouch: () => {
          move.low = !move.low;
        },
      };

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(el);
      cleanup.push(() => observer.disconnect());

      const onKey = (e: KeyboardEvent, down: boolean) => {
        if (e.code === 'Escape' && down) {
          drop();
          setPicked(null);
          return;
        }
        const k = keyFor(e.code);
        if (k) {
          move[k as 'f' | 'b' | 'l' | 'r'] = down;
          e.preventDefault();
        }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') move.fast = down;
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') move.low = down;
        if (e.code === 'KeyC' && down) move.low = !move.low;
      };
      const keyDown = (e: KeyboardEvent) => onKey(e, true);
      const keyUp = (e: KeyboardEvent) => onKey(e, false);
      addEventListener('keydown', keyDown);
      addEventListener('keyup', keyUp);
      cleanup.push(() => {
        removeEventListener('keydown', keyDown);
        removeEventListener('keyup', keyUp);
      });

      const look = (dx: number, dy: number) => {
        pose.yaw -= dx * 0.0024;
        pose.pitch = Math.max(-PITCH, Math.min(PITCH, pose.pitch - dy * 0.0024));
      };

      const onMouseMove = (e: MouseEvent) => {
        if (document.pointerLockElement === el) {
          look(e.movementX, e.movementY);
          aimed = true;
          pointer.set(0, 0);
          return;
        }
        const r = el.getBoundingClientRect();
        pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        aimed = true;
      };
      el.addEventListener('mousemove', onMouseMove);
      cleanup.push(() => el.removeEventListener('mousemove', onMouseMove));

      const onClick = () => {
        if (hit) {
          if (hit.slot >= 0) pull(hit.slot);
          else if ('fixture' in hit) setShown(hit.fixture);
          return;
        }
        // Some browsers reject the request (and some return a promise that rejects); walking still works.
        if (!touch && document.pointerLockElement !== el) {
          try {
            const ask = el.requestPointerLock() as unknown as Promise<void> | undefined;
            ask?.catch?.(() => {});
          } catch {
            /* keep going without it */
          }
        }
      };
      el.addEventListener('click', onClick);
      cleanup.push(() => el.removeEventListener('click', onClick));

      const onLock = () => setLocked(document.pointerLockElement === el);
      document.addEventListener('pointerlockchange', onLock);
      cleanup.push(() => {
        document.removeEventListener('pointerlockchange', onLock);
        if (document.pointerLockElement === el) document.exitPointerLock();
      });

      // Touch: one finger turns the head, and a tap that didn't turn anything picks a box.
      let dragging = -1;
      let last = { x: 0, y: 0 };
      let moved = 0;
      const onDown = (e: PointerEvent) => {
        if (e.pointerType !== 'touch') return;
        dragging = e.pointerId;
        last = { x: e.clientX, y: e.clientY };
        moved = 0;
      };
      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== dragging) return;
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        moved += Math.abs(dx) + Math.abs(dy);
        look(dx * 1.7, dy * 1.7);
      };
      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== dragging) return;
        dragging = -1;
        if (moved < 10) {
          const r = el.getBoundingClientRect();
          pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          aimed = true;
          // A tap has to find its box now: the click that follows won't wait for the next frame's cast.
          hit = cast();
          setHoverName(titleOf(hit));
          if (hit) {
            if (hit.slot >= 0) pull(hit.slot);
            else if ('fixture' in hit) setShown(hit.fixture);
          }
        }
      };
      el.addEventListener('pointerdown', onDown);
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', onUp);
      cleanup.push(() => {
        el.removeEventListener('pointerdown', onDown);
        removeEventListener('pointermove', onMove);
        removeEventListener('pointerup', onUp);
      });

      const pad = stick.current;
      if (pad) {
        let id = -1;
        let origin = { x: 0, y: 0 };
        const padDown = (e: PointerEvent) => {
          id = e.pointerId;
          origin = { x: e.clientX, y: e.clientY };
          pad.setPointerCapture(e.pointerId);
        };
        const padMove = (e: PointerEvent) => {
          if (e.pointerId !== id) return;
          const dx = (e.clientX - origin.x) / 46;
          const dy = (e.clientY - origin.y) / 46;
          touchMove = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) };
        };
        const padUp = () => {
          id = -1;
          touchMove = { x: 0, y: 0 };
        };
        pad.addEventListener('pointerdown', padDown);
        pad.addEventListener('pointermove', padMove);
        pad.addEventListener('pointerup', padUp);
        pad.addEventListener('pointercancel', padUp);
        cleanup.push(() => {
          pad.removeEventListener('pointerdown', padDown);
          pad.removeEventListener('pointermove', padMove);
          pad.removeEventListener('pointerup', padUp);
          pad.removeEventListener('pointercancel', padUp);
        });
      }

      const forward = new three.Vector3();
      const right = new three.Vector3();
      let previous = performance.now();
      let nearest: Stop | null = null;

      const loop = () => {
        frame = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = Math.min(0.05, (now - previous) / 1000);
        previous = now;

        forward.set(-Math.sin(pose.yaw), 0, -Math.cos(pose.yaw));
        right.set(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw));
        const speed = (move.fast ? RUN : WALK) * dt;
        let dx = (move.r ? 1 : 0) - (move.l ? 1 : 0) + touchMove.x;
        let dz = (move.f ? 1 : 0) - (move.b ? 1 : 0) - touchMove.y;
        const len = Math.hypot(dx, dz);
        if (len > 1) {
          dx /= len;
          dz /= len;
        }
        if (dx || dz) {
          const [nx, nz] = collide(
            pose.x + (forward.x * dz + right.x * dx) * speed,
            pose.z + (forward.z * dz + right.z * dx) * speed,
            plan,
            rects,
          );
          pose.x = nx;
          pose.z = nz;
        }
        const want = move.low ? CROUCH : EYE;
        eye += (want - eye) * Math.min(1, dt * 9);
        camera.position.set(pose.x, eye, pose.z);
        camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');

        if (aimed && now - hitAt > 70) {
          hitAt = now;
          const next = cast();
          if (titleOf(next) !== titleOf(hit)) {
            hit = next;
            setHoverName(titleOf(next));
          }
          if (hit && hit.slot >= 0) {
            const slot = built.slots[hit.slot];
            outline.visible = !held.has(`${hit.slot}`);
            outline.position.set(slot.x, slot.y, slot.z);
            outline.rotation.y = slot.yaw;
            outline.scale.set(slot.w + 0.004, slot.h + 0.004, slot.d + 0.004);
          } else {
            outline.visible = false;
          }

          // Whichever platform's run you're standing closest to along the wall.
          let best: Stop | null = null;
          let bestDistance = Infinity;
          for (const stop of plan.stops) {
            const distance = Math.abs(stop.x - pose.x);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = stop;
            }
          }
          if (best && best !== nearest) {
            nearest = best;
            setHere(best);
          }
        }

        if (pulled) {
          pulled.t = Math.max(0, Math.min(1, pulled.t + dt * (pulled.out ? 3.2 : -4)));
          const e = pulled.t * pulled.t * (3 - 2 * pulled.t);
          const target = new three.Vector3(
            camera.position.x + forward.x * 0.62,
            camera.position.y - 0.06 + Math.sin(pose.pitch) * 0.5,
            camera.position.z + forward.z * 0.62,
          );
          pulled.mesh.position.lerpVectors(pulled.from, target, e);
          let turn = pose.yaw - Math.PI / 2 - pulled.yaw;
          while (turn > Math.PI) turn -= Math.PI * 2;
          while (turn < -Math.PI) turn += Math.PI * 2;
          pulled.mesh.rotation.set(pose.pitch * e, pulled.yaw + turn * e, 0, 'YXZ');
          if (!pulled.out && pulled.t === 0) {
            collapse(pulled.slot, false);
            scene.remove(pulled.mesh);
            pulled.mesh.geometry.dispose();
            pulled = null;
          }
        }

        renderer.render(scene, camera);
      };
      loop();
      setPhase('ready');

      cleanup.push(() => {
        cancelAnimationFrame(frame);
        for (const l of built.labels) {
          l.mesh.geometry.dispose();
          (l.mesh.material as THREE_NS.Material).dispose();
        }
        built.bodies.geometry.dispose();
        (built.bodies.material as THREE_NS.Material).dispose();
        built.furniture.geometry.dispose();
        (built.furniture.material as THREE_NS.Material).dispose();
        for (const t of built.textures) t.dispose();
        outline.geometry.dispose();
        renderer.dispose();
      });
    })().catch(() => setPhase('error'));

    return () => {
      live = false;
      api.current = null;
      for (const fn of cleanup) fn();
    };
  }, [plan]);

  if (phase === 'error') return <div className="empty">This browser won't give the room a 3D canvas.</div>;

  return (
    <section className="room">
      <div className="room-stage">
        <canvas ref={canvas} className="room-canvas" />
        {phase === 'loading' && <div className="room-loading">Building the room…</div>}
        <div className="room-crosshair" aria-hidden />
        <div className="room-where">
          <span className="eyebrow">{here ? here.label : 'the doorway'}</span>
          <span className="muted small">
            {here
              ? `${here.count} ${here.count === 1 ? 'box' : 'boxes'}`
              : `${plan.shelved} on the shelves · ${plan.crated} loose · ${plan.cased} built in`}
          </span>
        </div>
        {hover && !picked && <div className="room-hover">{hover}</div>}
        {!touch && !locked && !picked && (
          <div className="room-hint">Click to look around · WASD to walk · C to crouch · click a box to take it off the shelf</div>
        )}
        {touch && !picked && <div className="room-hint top">Drag to look · stick to walk · tap a box</div>}
        {touch && (
          <button className="room-crouch" onClick={() => api.current?.crouch()}>
            Crouch
          </button>
        )}
        {touch && <div ref={stick} className="room-stick" aria-label="Walk" />}
        {shown && (
          <div className="room-card room-list">
            <div className="room-card-body">
              <strong>{shown.title}</strong>
              <span className="muted small">{shown.note}</span>
              <ul className="room-built">
                {shown.games.map((g) => (
                  <li key={g.id}>
                    <button className="ref-link" onClick={() => onOpen(g)}>
                      <span className="ref-title">{g.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <span className="room-card-actions">
                <button
                  className="btn"
                  onClick={() => {
                    setShown(null);
                    api.current?.putBack();
                  }}
                >
                  Close
                </button>
              </span>
            </div>
          </div>
        )}
        {picked && (
          <div className="room-card">
            <div className="room-card-cover">
              <Cover game={picked} eager />
            </div>
            <div className="room-card-body">
              <strong>{picked.title}</strong>
              <span className="bl-meta">
                <PlatformBadge platform={picked.platform} />
                <RatingBadge rating={picked.rating} />
                <StatusBadge status={picked.status} />
              </span>
              <span className="muted small">Bought {formatDate(picked.acquired)}</span>
              <span className="room-card-actions">
                <button className="btn primary" onClick={() => onOpen(picked)}>
                  Open in collection
                </button>
                <button className="btn" onClick={() => api.current?.putBack()}>
                  Put it back
                </button>
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="room-bays">
        {plan.stops.map((stop) => (
          <button
            key={stop.id}
            className={`room-bay ${here?.id === stop.id ? 'on' : ''}`}
            style={{ '--bay': stop.colour } as React.CSSProperties}
            onClick={() => api.current?.goTo(stop)}
          >
            {stop.label} <span className="muted">{stop.count}</span>
          </button>
        ))}
        {plan.consoles.map((c) => (
          <button
            key={c.name}
            className="room-bay room-console"
            onClick={() => setShown({ title: c.name, note: `${c.count} games built in, no boxes to shelve`, games: c.games })}
          >
            {c.name} <span className="muted">{c.count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

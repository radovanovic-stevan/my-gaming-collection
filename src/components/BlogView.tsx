import { Fragment, useEffect, useRef, useState } from 'react';
import type { BlogPost } from '../types';
import { api } from '../lib/api';
import { formatDate, imageUrl } from '../lib/format';
import { toImageDataUrl } from '../lib/image';

interface Props {
  posts: BlogPost[];
  /** Local editing (dev server only). */
  editable: boolean;
  onChange: (posts: BlogPost[]) => void;
}

/** Newest posts first. Same order the API saves them in. */
const sortPosts = (posts: BlogPost[]) => [...posts].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
const today = () => new Date().toISOString().slice(0, 10);
const isHttpUrl = (s: string) => /^https?:\/\//i.test(s.trim());
/** Covers are shown wide, so they get as much room as gallery pictures. */
const COVER_MAX_SIDE = 1600;

/** Turns bare http(s) links into anchors. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Plain text as paragraphs: blank lines split paragraphs, single line breaks are kept. */
export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              <Linked text={line} />
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

function PostEditor({ post, onSaved, onDeleted, onClose }: {
  /** Post to edit, or null to write a new one. */
  post: BlogPost | null;
  onSaved: (post: BlogPost) => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [date, setDate] = useState(post?.date ?? today());
  const [body, setBody] = useState(post?.body ?? '');
  // A newly chosen cover, as a resized data URL; `removed` drops the saved one.
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (getBlob: () => Promise<Blob>) => {
    setError(null);
    try {
      setDataUrl(await toImageDataUrl(await getBlob(), COVER_MAX_SIDE));
      setRemoved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const pickFile = (files: Iterable<File>) => {
    const file = [...files].find((f) => f.type.startsWith('image/'));
    if (file) pick(async () => file);
  };

  // Paste a cover (or an image URL) while the editor is open; Escape closes it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        pickFile(files);
        return;
      }
      const text = e.clipboardData?.getData('text') ?? '';
      if (isHttpUrl(text) && !(e.target as HTMLElement).closest('input, textarea')) setUrl(text.trim());
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) return pickFile(e.dataTransfer.files);
    const dropped = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (isHttpUrl(dropped)) pick(() => api.fetchImage(dropped.trim()));
  };

  const preview = dataUrl ?? (post?.cover && !removed ? imageUrl(post.cover) : null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const input = { title, date, body, ...(dataUrl ? { dataUrl } : removed ? { cover: null } : {}) };
      onSaved(post ? await api.updatePost(post.id, input) : await api.addPost(input));
    });
  };

  const remove = () => {
    if (post && confirm(`Delete "${post.title}"? This can't be undone.`)) {
      run(async () => (await api.deletePost(post.id), onDeleted(post.id)));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal award-editor wide" onSubmit={submit} onClick={(e) => e.stopPropagation()} aria-label={post ? 'Edit post' : 'New post'}>
        <button type="button" className="modal-close icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{post ? 'Edit post' : 'New post'}</h2>
        <div className="editor-row">
          <label className="field grow">
            <span>Title</span>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div
          className={`dropzone picture-drop ${dragging ? 'dragging' : ''} ${preview ? 'has-picture' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
        >
          {preview && <img src={preview} alt="" />}
          <b>{preview ? 'Replace the cover image' : 'Cover image (optional)'}</b>
          <span>Drop one here, click to choose a file, or paste with ⌘V</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              if (e.target.files) pickFile(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <div className="url-row">
          <input type="url" placeholder="…or paste an image URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="button" className="btn" disabled={!isHttpUrl(url) || busy} onClick={() => pick(() => api.fetchImage(url.trim())).then(() => setUrl(''))}>
            Fetch
          </button>
          {preview && (
            <button type="button" className="btn" onClick={() => (setDataUrl(null), setRemoved(true))}>
              Remove cover
            </button>
          )}
        </div>
        <label className="field">
          <span>Post</span>
          <textarea required rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's on your mind? Leave a blank line between paragraphs." />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          {post && (
            <button type="button" className="btn danger" onClick={remove} disabled={busy}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : post ? 'Save changes' : 'Publish'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function BlogView({ posts, editable, onChange }: Props) {
  // undefined: closed; null: writing a new post; otherwise the post being edited.
  const [editing, setEditing] = useState<BlogPost | null | undefined>(undefined);

  const onSaved = (saved: BlogPost) => {
    onChange(sortPosts([...posts.filter((p) => p.id !== saved.id), saved]));
    setEditing(undefined);
  };
  const onDeleted = (id: number) => {
    onChange(posts.filter((p) => p.id !== id));
    setEditing(undefined);
  };

  return (
    <section className="awards blog">
      <div className="awards-head">
        <div>
          <h2>Blog</h2>
          <p className="muted">Short notes on games, hunts and the collection.</p>
        </div>
        {editable && (
          <div className="awards-actions">
            <button className="btn primary" onClick={() => setEditing(null)}>
              + New post
            </button>
          </div>
        )}
      </div>

      {posts.length === 0 ? (
        <div className="empty">No posts yet.{editable ? ' Write the first one with “+ New post”.' : ''}</div>
      ) : (
        <ol className="blog-posts">
          {posts.map((post) => (
            <li key={post.id}>
              <article className="blog-post">
                {post.cover && <img className="blog-post-cover" src={imageUrl(post.cover)} alt="" loading="lazy" />}
                <header className="blog-post-head">
                  <time className="muted small" dateTime={post.date}>
                    {formatDate(post.date)}
                  </time>
                  {editable && (
                    <button className="link" onClick={() => setEditing(post)}>
                      Edit
                    </button>
                  )}
                </header>
                <h3 className="blog-post-title">{post.title}</h3>
                <div className="blog-post-body">
                  <Paragraphs text={post.body} />
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}

      {editing !== undefined && <PostEditor post={editing} onSaved={onSaved} onDeleted={onDeleted} onClose={() => setEditing(undefined)} />}
    </section>
  );
}

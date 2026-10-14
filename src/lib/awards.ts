/** How the yearly award categories are told apart; shared by the Awards tab and the Year in Review. */

/** The top three Game of the Year places, first to third. */
export const PODIUM = ['Game of the Year Winner', 'Game of the Year Runner-Up', 'Game of the Year Third Place'];

export const PLATFORM_WORDS = /^(PS1|PS Classic|PS2|PS3|PS4|Wii|3DS|DS|GCN|SNES Classic|PSP|VITA|Atari FB|PC)\b/;

export const isQuarter = (c: string) => /^Best Game of Q\d/.test(c);
export const isPlatformAward = (c: string) => PLATFORM_WORDS.test(c) && c.endsWith('GOTY');
export const isGenreAward = (c: string) => c.endsWith('GOTY') && !PLATFORM_WORDS.test(c) && !c.startsWith('Games from') && !c.startsWith('Co-op');

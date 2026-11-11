/*
 * The fixed copy of feed feedback (spec 0011). The server, the client and the
 * tests read this one source. Every name and announcement carries the movie
 * title, so a list of cards does not read as many identical buttons.
 */

export const MORE_LIKE_THIS_LABEL = "More like this";
export const NOT_INTERESTED_LABEL = "Not interested";
export const UNDO_LABEL = "Undo";
export const HIDDEN_LINE = "Hidden from your picks.";
export const SAVE_ERROR = "Could not save. Try again.";
export const SESSION_ENDED = "Your session ended.";
export const SIGN_IN_AGAIN_LABEL = "Sign in again";

/** The accessible names of the buttons. Each starts with the visible label. */
export const buttonNames = {
  moreLikeThis: (title: string) => `More like this: ${title}`,
  notInterested: (title: string) => `Not interested in ${title}`,
  undo: (title: string) => `Undo hiding ${title}`,
};

/** What the live region says after a save. */
export const announcements = {
  hidden: (title: string) => `${title} hidden from your picks`,
  restored: (title: string) => `${title} is back in your picks`,
  moreLikeThis: (title: string) => `More like ${title} on your next picks`,
  removedMoreLikeThis: (title: string) => `Removed more like ${title}`,
};

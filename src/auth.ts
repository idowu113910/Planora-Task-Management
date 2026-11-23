const KEY = "planora-signed-in";

export const isSignedIn = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
};

export const markSignedIn = () => {
  try {
    localStorage.setItem(KEY, "true");
  } catch {
    /* storage blocked */
  }
};

export const markSignedOut = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
};

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

// Public web config (not a secret). Firebase is used only to obtain a Google ID token;
// the server verifies it and issues its own session cookie.
const app = initializeApp({
  apiKey: "AIzaSyC9b93limwBk0cyDU3MEEu-9QKk1ubjLGo",
  authDomain: "hamptonestatesjersey.firebaseapp.com",
  projectId: "hamptonestatesjersey",
  appId: "1:760161138036:web:f94005452426188f946821",
});
const auth = getAuth(app);

export async function googleIdToken() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const { user } = await signInWithPopup(auth, provider);
  return user.getIdToken();
}
export const firebaseSignOut = () => signOut(auth);

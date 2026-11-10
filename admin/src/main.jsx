import { createRoot } from "react-dom/client";
import "./styles.css";

const root=createRoot(document.getElementById("root"));
const screen=location.hash==="#/qa-history" ? import("./QaHistoryApp.jsx") : import("./App.jsx");
screen.then(({default:Screen})=>root.render(<Screen />),
  ()=>root.render(<p role="alert">Couldn't open this page. Try again.</p>));

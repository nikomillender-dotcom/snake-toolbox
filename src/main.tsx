import { render } from "preact";
import { App } from "./App";

const root = document.getElementById("app");
if (!root) throw new Error("main.tsx: #app root element missing from index.html");
render(<App />, root);

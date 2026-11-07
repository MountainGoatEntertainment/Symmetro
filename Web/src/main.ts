import "./style.css";
import { App } from "./app";
import { Splash, splash } from "./scenes";

splash(); // start loading the picture right away
const canvas = document.getElementById("game") as HTMLCanvasElement;
new App(canvas, (app) => new Splash(app));

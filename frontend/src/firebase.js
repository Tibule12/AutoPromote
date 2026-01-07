// Fix for legacy imports referencing "../firebase" instead of "../firebaseClient"
// This file simply re-exports everything from firebaseClient.js

export * from "./firebaseClient";
export { default } from "./firebaseClient";

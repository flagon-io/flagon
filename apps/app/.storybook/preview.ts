import type { Preview } from "@storybook/react-vite";
import React from "react";
import "../src/app/globals.css";

/**
 * The app is a single dark theme on a pure-black base, so every story renders on
 * black with light text and some padding — matching the real console chrome.
 */
const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    backgrounds: { disable: true },
    a11y: { test: "todo" },
  },
  decorators: [
    (Story) =>
      React.createElement(
        "div",
        { className: "min-h-screen bg-black p-6 text-zinc-100" },
        React.createElement("div", { className: "mx-auto max-w-3xl" }, React.createElement(Story)),
      ),
  ],
};

export default preview;

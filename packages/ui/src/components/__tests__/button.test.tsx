import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, buttonClasses } from "../button";
import { Badge } from "../badge";

describe("Button", () => {
  it("renders a button with its label", () => {
    render(<Button>Deploy</Button>);
    expect(screen.getByRole("button", { name: "Deploy" })).toBeDefined();
  });

  it("renders as its child element with asChild (Radix Slot)", () => {
    render(
      <Button asChild>
        <a href="/new">New project</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "New project" });
    expect(link.getAttribute("href")).toBe("/new");
    // The Slot merges button classes onto the anchor.
    expect(link.className).toContain("inline-flex");
  });

  it("passes through disabled", () => {
    render(<Button disabled>Off</Button>);
    expect((screen.getByRole("button", { name: "Off" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("buttonClasses", () => {
  it("varies by variant and size", () => {
    expect(buttonClasses({ variant: "destructive" })).toContain("bg-destructive");
    expect(buttonClasses({ variant: "outline" })).toContain("border");
  });
});

describe("Badge", () => {
  it("renders its content", () => {
    render(<Badge variant="success">Live</Badge>);
    expect(screen.getByText("Live")).toBeDefined();
  });
});

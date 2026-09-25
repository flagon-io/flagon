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

  it("defaults to type=button so it never submits a surrounding form by accident", () => {
    let submitted = 0;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitted++;
        }}
      >
        <Button>Cancel</Button>
        <Button type="submit">Save</Button>
      </form>,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(cancel.type).toBe("button");
    cancel.click();
    expect(submitted).toBe(0);
    (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).click();
    expect(submitted).toBe(1);
  });

  it("does not force a type onto an asChild element", () => {
    render(
      <Button asChild>
        <a href="/docs">Docs</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Docs" }).hasAttribute("type")).toBe(false);
  });

  it("forwards a ref (React 19 ref-as-prop) and tags its slot", () => {
    let node: HTMLButtonElement | null = null;
    render(<Button ref={(el) => { node = el; }}>Ref</Button>);
    expect(node).toBe(screen.getByRole("button", { name: "Ref" }));
    expect(screen.getByRole("button", { name: "Ref" }).getAttribute("data-slot")).toBe("button");
  });

  it("passes through disabled", () => {
    render(<Button disabled>Off</Button>);
    expect((screen.getByRole("button", { name: "Off" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("buttonClasses", () => {
  it("varies by variant and size", () => {
    expect(buttonClasses({ variant: "destructive" })).toContain("bg-destructive");
    // Text on the destructive fill is a token a Brand can set, not a fixed white.
    expect(buttonClasses({ variant: "destructive" })).toContain("text-destructive-foreground");
    expect(buttonClasses({ variant: "outline" })).toContain("border");
  });
});

describe("Badge", () => {
  it("renders its content", () => {
    render(<Badge variant="success">Live</Badge>);
    expect(screen.getByText("Live")).toBeDefined();
  });

  it("colors status variants from the status tokens, not a fixed palette", () => {
    render(<Badge variant="warning">Degraded</Badge>);
    const el = screen.getByText("Degraded");
    expect(el.className).toContain("text-warning");
    expect(el.className).not.toMatch(/amber|emerald/);
    expect(el.getAttribute("data-slot")).toBe("badge");
  });
});

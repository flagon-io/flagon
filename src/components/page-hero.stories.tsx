import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageHero } from "./page-hero";

/**
 * The marketing hero, at both sizes.
 *
 * Worth a story because the hero is where this site's spacing rules actually
 * live, and because the two sizes only make sense compared with each other:
 * `lead` has to feel like a front door without `page` feeling like an
 * afterthought. Flip between these two and the gap is obvious; open two
 * browser tabs and it is not.
 */
const meta = {
  title: "Marketing/PageHero",
  component: PageHero,
} satisfies Meta<typeof PageHero>;

export default meta;
type Story = StoryObj<typeof meta>;

const actions = (
  <>
    <button className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950">
      Start for free
    </button>
    <button className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300">
      See pricing
    </button>
  </>
);

export const Lead: Story = {
  args: {
    size: "lead",
    hex: "hero",
    glow: false,
    eyebrow: "The self-hostable developer platform",
    title: (
      <>
        Stop building your platform.
        <br />
        <span className="text-zinc-500">Start shipping on it.</span>
      </>
    ),
    lede: "One hub for your projects, environments, and teams, with the products you'd otherwise buy or build stitched right in.",
    actions,
    footnote: "Free to start, no card required.",
  },
};

export const Interior: Story = {
  args: {
    eyebrow: "Products",
    title: (
      <>
        One platform.
        <br />
        <span className="text-zinc-500">Not five subscriptions.</span>
      </>
    ),
    lede: "Every product here shares the same organizations, projects, teams, and access model, and draws on the same pooled usage credit.",
    actions,
  },
};

/** No eyebrow, no actions: the headline must still sit correctly on its own. */
export const TitleOnly: Story = {
  args: { title: "Terms of service", hex: "none", glow: false },
};

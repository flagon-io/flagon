/**
 * @flagon/design: the shared design system.
 *
 * Brand tokens, the logo mark, and the layout/UI primitives every Flagon
 * surface is built from. Import the pieces from here; import the stylesheet
 * once per app with `import "@flagon/design/styles.css"`.
 */
export { brand } from "./brand";
export {
  FlagonMark,
  tankardPaths,
  tankardStrokeWidth,
} from "./logo";
export { GridBackdrop } from "./components/grid-backdrop";
export { HexField } from "./components/hex-field";
export { BleedBand, CornerMark } from "./components/bleed-band";
export { Cta } from "./components/cta";
export { PageHero } from "./components/page-hero";
export { PlanCard } from "./components/plan-card";
export { Select, type SelectOption } from "./components/select";
export {
  SegmentedControl,
  type SegmentedOption,
} from "./components/segmented-control";
export { Input, Textarea } from "./components/input";
export { Field } from "./components/field";
export { Button, type ButtonVariant } from "./components/button";
export { Switch } from "./components/switch";
export { Skeleton } from "./components/skeleton";
export {
  Toaster,
  toast,
  type ToastTone,
  type ToastItem,
} from "./components/toast";
export {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "./components/modal";
export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuLabel,
} from "./components/menu";
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
  PopoverAnchor,
} from "./components/popover";
export {
  PLANS,
  DEFAULT_PLAN,
  SELECTABLE_PLANS,
  SELF_HOST_NOTE,
  isPlanId,
  isSelectablePlan,
  planName,
  planAllowsInvites,
} from "./plans";
export type { Plan, PlanId, PlanPrice, PlanFeature } from "./plans";
export {
  IconStandards,
  IconUsage,
  IconSelfHost,
  IconArrowRight,
  IconGitHub,
} from "./components/icons";

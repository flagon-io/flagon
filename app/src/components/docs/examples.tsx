"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  Info,
  CircleCheck,
  TriangleAlert,
  CircleX,
  ChevronsUpDown,
  ChevronDown,
  Plus,
  Settings,
  LayoutDashboard,
  Boxes,
  Bold,
  Italic,
  Underline,
  Inbox,
  Star,
} from "lucide-react";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Badge,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AspectRatio,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  ButtonGroup,
  Empty,
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
  Progress,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Spinner,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Prose,
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  Button,
  buttonClasses,
  Calendar,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Checkbox,
  ColorInput,
  DateField,
  DateRangeField,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Input,
  InputGroup,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
  REGEXP_ONLY_DIGITS,
  Kbd,
  Label,
  MoneyInput,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Select,
  SelectField,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  Skeleton,
  Slider,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Combobox,
  type ComboboxOption,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
  Toaster,
  toast,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  DataTable,
  DataTableFacetedFilter,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  SheetDescription,
  SheetClose,
  type ChartConfig,
  type ColumnDef,
  type DateRange,
} from "@flagon-io/ui";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
} from "recharts";

function CalendarDemo() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      captionLayout="dropdown"
      startMonth={new Date(new Date().getFullYear() - 5, 0)}
      endMonth={new Date(new Date().getFullYear() + 5, 11)}
      className="rounded-lg border border-hairline"
    />
  );
}

function CalendarBoundedDemo() {
  const [date, setDate] = useState<Date | undefined>();
  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      // No past dates, and no weekends.
      disabled={[{ before: new Date() }, { dayOfWeek: [0, 6] }]}
      className="rounded-lg border border-hairline"
    />
  );
}

function CalendarRangeDemo() {
  const [range, setRange] = useState<DateRange | undefined>();
  return (
    <Calendar
      mode="range"
      numberOfMonths={2}
      selected={range}
      onSelect={setRange}
      className="rounded-lg border border-hairline"
    />
  );
}

function SelectFieldDemo() {
  const [region, setRegion] = useState("iad");
  return (
    <SelectField
      className="w-60"
      aria-label="Region"
      placeholder="Select a region"
      value={region}
      onValueChange={setRegion}
      options={[
        { value: "iad", label: "Washington, D.C. (iad)" },
        { value: "sfo", label: "San Francisco (sfo)" },
        { value: "fra", label: "Frankfurt (fra)" },
      ]}
    />
  );
}

function DateFieldDemo() {
  const [date, setDate] = useState<Date | null>(null);
  return (
    <div className="w-full max-w-xs space-y-2">
      <DateField
        aria-label="Pick a date"
        min={new Date()}
        disabledDates={{ dayOfWeek: [0, 6] }}
        onChange={setDate}
      />
      <p className="text-xs text-muted-foreground">
        Value: {date ? date.toDateString() : "none yet"}
      </p>
    </div>
  );
}

function DateRangeFieldDemo() {
  const [range, setRange] = useState<DateRange | undefined>();
  return (
    <div className="w-full max-w-sm space-y-2">
      <DateRangeField aria-label="Reporting period" onChange={setRange} />
      <p className="text-xs text-muted-foreground">
        {range?.from
          ? `${range.from.toDateString()} - ${range.to ? range.to.toDateString() : "..."}`
          : "No range yet"}
      </p>
    </div>
  );
}

function MoneyInputDemo() {
  const [value, setValue] = useState<number | null>(1250);
  return (
    <div className="w-full max-w-xs space-y-2">
      <Label htmlFor="budget">Monthly budget</Label>
      <MoneyInput id="budget" defaultValue={1250} onValueChange={setValue} />
      <p className="text-xs text-muted-foreground">
        Try <code className="font-mono">35k</code>, <code className="font-mono">2.5m</code>, or{" "}
        <code className="font-mono">5500 + 7300</code>, then click away. Value:{" "}
        <span className="text-foreground">{value ?? "null"}</span>
      </p>
    </div>
  );
}

function ColorInputDemo() {
  const [color, setColor] = useState("#0d9488");
  return (
    <div className="w-full max-w-xs space-y-2">
      <ColorInput value={color} onChange={setColor} aria-label="Brand color" />
      <p className="text-xs text-muted-foreground">
        Type a hex, or open the picker (drag the field + hue, use the eyedropper). Value:{" "}
        <span className="font-mono text-foreground">{color}</span>
      </p>
    </div>
  );
}

function SliderDemo() {
  const [value, setValue] = useState([40]);
  const [range, setRange] = useState([20, 70]);
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2">
        <Slider value={value} onValueChange={setValue} max={100} step={1} aria-label="Level" />
        <p className="text-xs text-muted-foreground">Single: {value[0]}</p>
      </div>
      <div className="space-y-2">
        <Slider
          value={range}
          onValueChange={setRange}
          max={100}
          step={1}
          thumbLabels={["Minimum", "Maximum"]}
        />
        <p className="text-xs text-muted-foreground">
          Range: {range[0]} - {range[1]}
        </p>
      </div>
    </div>
  );
}

function MoneyCurrencyDemo() {
  const [value, setValue] = useState<number | null>(4200);
  const [currency, setCurrency] = useState("USD");
  return (
    <div className="w-full max-w-xs space-y-2">
      <Label htmlFor="price">Price</Label>
      <MoneyInput
        id="price"
        defaultValue={4200}
        currency={currency}
        currencies={["USD", "EUR", "GBP", "JPY", "CAD"]}
        onCurrencyChange={setCurrency}
        onValueChange={setValue}
      />
      <p className="text-xs text-muted-foreground">
        Pick a currency, or type a symbol like <code className="font-mono">¥32156</code> /{" "}
        <code className="font-mono">£99</code> and it switches for you. Value:{" "}
        <span className="text-foreground">
          {value ?? "null"} {currency}
        </span>
      </p>
    </div>
  );
}

function InputOTPDemo() {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-2">
      <InputOTP
        maxLength={6}
        value={value}
        onChange={setValue}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        aria-label="Verification code"
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      <p className="text-xs text-muted-foreground">Entered: {value || "------"}</p>
    </div>
  );
}

const MODE_OPTIONS = [
  { value: "iad", label: "Washington, D.C. (iad)" },
  { value: "sfo", label: "San Francisco (sfo)" },
  { value: "fra", label: "Frankfurt (fra)" },
];

function SelectModesDemo() {
  const [a, setA] = useState("iad");
  const [b, setB] = useState("iad");
  return (
    <div className="grid w-full gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Radix (always themed menu)</Label>
        <SelectField
          mode="radix"
          aria-label="Region (Radix menu)"
          className="w-full"
          options={MODE_OPTIONS}
          value={a}
          onValueChange={setA}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Native (always OS picker)</Label>
        <SelectField
          mode="native"
          aria-label="Region (native picker)"
          className="w-full"
          options={MODE_OPTIONS}
          value={b}
          onValueChange={setB}
        />
      </div>
    </div>
  );
}

function RadioGroupDemo() {
  const [v, setV] = useState("comfortable");
  return (
    <RadioGroup value={v} onValueChange={setV} className="gap-3">
      {["compact", "comfortable", "spacious"].map((o) => (
        <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-foreground capitalize">
          <RadioGroupItem value={o} /> {o}
        </label>
      ))}
    </RadioGroup>
  );
}

function ToggleGroupDemo() {
  return (
    <ToggleGroup type="multiple" aria-label="Text formatting">
      <ToggleGroupItem value="bold" aria-label="Bold">
        <Bold className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        <Italic className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Underline">
        <Underline className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function ProgressDemo() {
  const [v, setV] = useState(30);
  return (
    <div className="w-full max-w-sm space-y-3">
      <Progress value={v} aria-label="Task progress" />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setV((x) => Math.max(0, x - 10))}>
          -10
        </Button>
        <Button size="sm" variant="outline" onClick={() => setV((x) => Math.min(100, x + 10))}>
          +10
        </Button>
        <span className="text-sm text-muted-foreground">{v}%</span>
      </div>
    </div>
  );
}

const REGION_OPTIONS = [
  { value: "iad", label: "Washington, D.C. (iad)" },
  { value: "sfo", label: "San Francisco (sfo)" },
  { value: "fra", label: "Frankfurt (fra)" },
  { value: "syd", label: "Sydney (syd)" },
  { value: "nrt", label: "Tokyo (nrt)" },
  { value: "gru", label: "São Paulo (gru)" },
];

function ComboboxDemo() {
  const [value, setValue] = useState("iad");
  return (
    <div className="w-full max-w-xs space-y-2">
      <Combobox
        aria-label="Select a region"
        options={REGION_OPTIONS}
        value={value}
        onValueChange={setValue}
        placeholder="Select a region"
        searchPlaceholder="Search regions…"
      />
      <p className="text-xs text-muted-foreground">Selected: {value || "none"}</p>
    </div>
  );
}

function AsyncComboboxDemo() {
  const [value, setValue] = useState("");
  // Stands in for a server search: filters the regions after a short delay, so the
  // options arrive asynchronously the way a `?q=` endpoint would return them.
  const loadOptions = useCallback(async (query: string): Promise<ComboboxOption[]> => {
    await new Promise((r) => setTimeout(r, 200));
    const q = query.toLowerCase();
    return REGION_OPTIONS.filter((o) => !q || o.label.toLowerCase().includes(q));
  }, []);
  return (
    <div className="w-full max-w-xs space-y-2">
      <Combobox
        aria-label="Find a region"
        loadOptions={loadOptions}
        value={value}
        onValueChange={setValue}
        placeholder="Find a region"
        searchPlaceholder="Search regions…"
      />
      <p className="text-xs text-muted-foreground">Selected: {value || "none"}</p>
    </div>
  );
}

function CommandDemo() {
  return (
    <Command className="max-w-md rounded-xl border border-hairline shadow-sm">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Projects">
          <CommandItem>
            <Boxes />
            <span>billing-api</span>
          </CommandItem>
          <CommandItem>
            <Boxes />
            <span>web</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem>
            <Plus />
            <span>New project</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Settings />
            <span>Open settings</span>
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function DrawerDemo() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Deploy billing-api</DrawerTitle>
            <DrawerDescription>Ship the current commit to production.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 text-sm text-muted-foreground">
            This creates a new production deployment. Drag down or press Escape to dismiss.
          </div>
          <DrawerFooter>
            <Button>Deploy</Button>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Toaster />
      <Button variant="outline" onClick={() => toast("Deployment queued", { description: "billing-api → production" })}>
        Show toast
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.success("Deployed", { description: "Live in 42s" })}
      >
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.error("Build failed", {
            description: "Exit code 1",
            action: { label: "Retry", onClick: () => toast("Retrying…") },
          })
        }
      >
        With action
      </Button>
    </div>
  );
}

function CarouselDemo() {
  return (
    <Carousel className="w-full max-w-xs">
      <CarouselContent>
        {Array.from({ length: 5 }).map((_, i) => (
          <CarouselItem key={i}>
            <div className="flex aspect-square items-center justify-center rounded-xl border border-hairline bg-panel text-4xl font-semibold text-foreground">
              {i + 1}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}

const CHART_DATA = [
  { month: "Apr", deploys: 42, rollbacks: 3 },
  { month: "May", deploys: 58, rollbacks: 5 },
  { month: "Jun", deploys: 71, rollbacks: 2 },
  { month: "Jul", deploys: 64, rollbacks: 4 },
  { month: "Aug", deploys: 89, rollbacks: 1 },
  { month: "Sep", deploys: 103, rollbacks: 6 },
];
const CHART_CONFIG: ChartConfig = {
  deploys: { label: "Deploys", color: "var(--color-brand)" },
  rollbacks: { label: "Rollbacks", color: "var(--color-muted-foreground)" },
};

function ChartDemo() {
  return (
    <ChartContainer config={CHART_CONFIG} className="min-h-56 w-full max-w-lg">
      <BarChart data={CHART_DATA}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="deploys" fill="var(--color-deploys)" radius={4} />
        <Bar dataKey="rollbacks" fill="var(--color-rollbacks)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

type DeployRow = { project: string; env: string; status: string; deploys: number };
const DEPLOY_ROWS: DeployRow[] = [
  { project: "billing-api", env: "production", status: "Live", deploys: 128 },
  { project: "web", env: "production", status: "Live", deploys: 342 },
  { project: "worker", env: "preview", status: "Paused", deploys: 12 },
  { project: "docs", env: "production", status: "Live", deploys: 57 },
  { project: "auth", env: "production", status: "Building", deploys: 91 },
  { project: "cron", env: "preview", status: "Live", deploys: 8 },
];
const DEPLOY_COLUMNS: ColumnDef<DeployRow>[] = [
  { accessorKey: "project", header: "Project", cell: ({ row }) => <span className="font-medium">{row.getValue("project")}</span> },
  { accessorKey: "env", header: "Environment" },
  { accessorKey: "status", header: "Status" },
  {
    accessorKey: "deploys",
    header: "Deploys",
    cell: ({ row }) => <span className="tabular-nums">{row.getValue("deploys")}</span>,
  },
];

function DataTableDemo() {
  return (
    <DataTable
      columns={DEPLOY_COLUMNS}
      data={DEPLOY_ROWS}
      filterColumn="project"
      filterPlaceholder="Filter projects…"
      pageSize={4}
      className="w-full max-w-2xl"
    />
  );
}

function ResizableDemo() {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-52 max-w-2xl rounded-xl border border-hairline">
      <ResizablePanel defaultSize="30" minSize="20">
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">Sidebar</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="70">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize="60">
            <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">Editor</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="40">
            <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">Terminal</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// --- Charts: one shared time series, plus a few shape-specific datasets. -----
function AreaChartDemo() {
  return (
    <ChartContainer config={CHART_CONFIG} className="min-h-56 w-full max-w-lg">
      <AreaChart data={CHART_DATA} margin={{ left: 4, right: 4 }}>
        <defs>
          <linearGradient id="fillDeploys" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-deploys)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="var(--color-deploys)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="deploys"
          type="natural"
          fill="url(#fillDeploys)"
          stroke="var(--color-deploys)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function BarChartStackedDemo() {
  return (
    <ChartContainer config={CHART_CONFIG} className="min-h-56 w-full max-w-lg">
      <BarChart data={CHART_DATA}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="deploys" stackId="a" fill="var(--color-deploys)" radius={[0, 0, 4, 4]} />
        <Bar dataKey="rollbacks" stackId="a" fill="var(--color-rollbacks)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

function LineChartDemo() {
  return (
    <ChartContainer config={CHART_CONFIG} className="min-h-56 w-full max-w-lg">
      <LineChart data={CHART_DATA} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line dataKey="deploys" type="monotone" stroke="var(--color-deploys)" strokeWidth={2} dot={false} />
        <Line dataKey="rollbacks" type="monotone" stroke="var(--color-rollbacks)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}

const RUNTIME_DATA = [
  { runtime: "Node", projects: 34, fill: "var(--color-chart-1)" },
  { runtime: "Go", projects: 21, fill: "var(--color-chart-2)" },
  { runtime: "Python", projects: 14, fill: "var(--color-chart-3)" },
  { runtime: "Rust", projects: 8, fill: "var(--color-chart-4)" },
  { runtime: "Other", projects: 5, fill: "var(--color-chart-5)" },
];
const RUNTIME_CONFIG: ChartConfig = {
  projects: { label: "Projects" },
  Node: { label: "Node", color: "var(--color-chart-1)" },
  Go: { label: "Go", color: "var(--color-chart-2)" },
  Python: { label: "Python", color: "var(--color-chart-3)" },
  Rust: { label: "Rust", color: "var(--color-chart-4)" },
  Other: { label: "Other", color: "var(--color-chart-5)" },
};

function PieChartDemo() {
  return (
    <ChartContainer config={RUNTIME_CONFIG} className="mx-auto aspect-square min-h-56 max-w-xs">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="runtime" hideLabel />} />
        <Pie data={RUNTIME_DATA} dataKey="projects" nameKey="runtime" innerRadius={48} strokeWidth={4}>
          {RUNTIME_DATA.map((d) => (
            <Cell key={d.runtime} fill={d.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

const HEALTH_DATA = [
  { axis: "Uptime", score: 96 },
  { axis: "Latency", score: 78 },
  { axis: "Coverage", score: 84 },
  { axis: "Build", score: 91 },
  { axis: "Security", score: 72 },
];
const HEALTH_CONFIG: ChartConfig = { score: { label: "Score", color: "var(--color-brand)" } };

function RadarChartDemo() {
  return (
    <ChartContainer config={HEALTH_CONFIG} className="mx-auto aspect-square min-h-56 max-w-xs">
      <RadarChart data={HEALTH_DATA}>
        <ChartTooltip content={<ChartTooltipContent />} />
        <PolarGrid />
        <PolarAngleAxis dataKey="axis" />
        <Radar
          dataKey="score"
          stroke="var(--color-score)"
          fill="var(--color-score)"
          fillOpacity={0.35}
        />
      </RadarChart>
    </ChartContainer>
  );
}

function RadialChartDemo() {
  return (
    <ChartContainer config={RUNTIME_CONFIG} className="mx-auto aspect-square min-h-56 max-w-xs">
      <RadialBarChart data={RUNTIME_DATA} innerRadius={30} outerRadius={110} startAngle={90} endAngle={-270}>
        <ChartTooltip content={<ChartTooltipContent nameKey="runtime" hideLabel />} />
        <RadialBar dataKey="projects" background cornerRadius={6}>
          {RUNTIME_DATA.map((d) => (
            <Cell key={d.runtime} fill={d.fill} />
          ))}
        </RadialBar>
      </RadialBarChart>
    </ChartContainer>
  );
}

// --- Data table: the full toolbar (search + faceted filter + column toggle,
// sortable headers, selection, pagination). ----------------------------------
const STATUS_OPTIONS = [
  { label: "Live", value: "Live" },
  { label: "Building", value: "Building" },
  { label: "Paused", value: "Paused" },
];
const POWER_COLUMNS: ColumnDef<DeployRow>[] = [
  { accessorKey: "project", header: "Project", cell: ({ row }) => <span className="font-medium">{row.getValue("project")}</span> },
  { accessorKey: "env", header: "Environment" },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "deploys",
    header: "Deploys",
    cell: ({ row }) => <span className="tabular-nums">{row.getValue("deploys")}</span>,
  },
];

function DataTablePowerDemo() {
  return (
    <DataTable
      columns={POWER_COLUMNS}
      data={DEPLOY_ROWS}
      filterColumn="project"
      filterPlaceholder="Filter projects…"
      enableColumnVisibility
      pageSize={4}
      className="w-full max-w-2xl"
      toolbar={(table) => (
        <DataTableFacetedFilter column={table.getColumn("status")} title="Status" options={STATUS_OPTIONS} />
      )}
    />
  );
}

function SheetDirectionsDemo() {
  const sides = ["left", "right", "top", "bottom"] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {sides.map((side) => (
        <Sheet key={side}>
          <SheetTrigger className={buttonClasses({ variant: "outline", size: "sm" })}>
            {side}
          </SheetTrigger>
          <SheetContent side={side} className="p-6">
            <SheetTitle className="text-lg font-semibold capitalize">{side} sheet</SheetTitle>
            <SheetDescription className="mt-1">
              Slides in from the {side} edge. Traps focus and closes on Escape or a backdrop click.
            </SheetDescription>
            <SheetClose className={buttonClasses({ variant: "outline", size: "sm" }) + " mt-4"}>
              Close
            </SheetClose>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  );
}

function DrawerDirectionsDemo() {
  const directions = ["bottom", "right", "left", "top"] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {directions.map((direction) => (
        <Drawer key={direction} direction={direction}>
          <DrawerTrigger asChild>
            <Button variant="outline" size="sm" className="capitalize">
              {direction}
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <div className="mx-auto w-full max-w-md">
              <DrawerHeader>
                <DrawerTitle className="capitalize">{direction} drawer</DrawerTitle>
                <DrawerDescription>Drag it back toward the {direction} edge to dismiss.</DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
                </DrawerClose>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
      ))}
    </div>
  );
}

function AlertDialogDismissibleDemo() {
  return (
    <AlertDialog>
      <AlertDialogTrigger className={buttonClasses({ variant: "outline" })}>
        Dismissible alert
      </AlertDialogTrigger>
      <AlertDialogContent dismissible>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>
            This one closes if you click the backdrop or press Escape - use it for low-stakes
            confirmations. Omit <code className="font-mono">dismissible</code> to force a choice.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type DocExample = {
  title?: string;
  description?: string;
  code: string;
  render: ReactNode;
};

export type DocEntry = { usage: string; examples: DocExample[] };

export const docs: Record<string, DocEntry> = {
  alert: {
    usage: `import { Alert, AlertTitle, AlertDescription } from "@flagon-io/ui";
import { Info } from "lucide-react";

<Alert variant="brand" icon={<Info />}>
  <AlertTitle>Heads up</AlertTitle>
  <AlertDescription>Something you should know about.</AlertDescription>
</Alert>`,
    examples: [
      {
        title: "Variants",
        description:
          "Severity-aware: destructive and warning announce as role=\"alert\"; the rest are polite role=\"status\".",
        code: `<div className="flex w-full flex-col gap-3">
  <Alert variant="brand" icon={<Info />}>
    <AlertTitle>Heads up</AlertTitle>
    <AlertDescription>The brand variant for informational callouts.</AlertDescription>
  </Alert>
  <Alert variant="success" icon={<CircleCheck />}>
    <AlertTitle>Saved</AlertTitle>
    <AlertDescription>Your changes were stored successfully.</AlertDescription>
  </Alert>
  <Alert variant="warning" icon={<TriangleAlert />}>
    <AlertTitle>Careful</AlertTitle>
    <AlertDescription>This action affects every environment.</AlertDescription>
  </Alert>
  <Alert variant="destructive" icon={<CircleX />}>
    <AlertTitle>Something went wrong</AlertTitle>
    <AlertDescription>We couldn't complete that request.</AlertDescription>
  </Alert>
</div>`,
        render: (
          <div className="flex w-full flex-col gap-3">
            <Alert variant="brand" icon={<Info />}>
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>The brand variant for informational callouts.</AlertDescription>
            </Alert>
            <Alert variant="success" icon={<CircleCheck />}>
              <AlertTitle>Saved</AlertTitle>
              <AlertDescription>Your changes were stored successfully.</AlertDescription>
            </Alert>
            <Alert variant="warning" icon={<TriangleAlert />}>
              <AlertTitle>Careful</AlertTitle>
              <AlertDescription>This action affects every environment.</AlertDescription>
            </Alert>
            <Alert variant="destructive" icon={<CircleX />}>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>We couldn&rsquo;t complete that request.</AlertDescription>
            </Alert>
          </div>
        ),
      },
    ],
  },

  calendar: {
    usage: `import { Calendar } from "@flagon-io/ui";
import { useState } from "react";

const [date, setDate] = useState<Date>();

<Calendar mode="single" selected={date} onSelect={setDate} />`,
    examples: [
      {
        title: "Single date",
        description: "A month grid built on react-day-picker. Also supports multiple and range selection via the mode prop, and a caption dropdown with captionLayout=\"dropdown\".",
        code: `const [date, setDate] = useState<Date>();

<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  captionLayout="dropdown"
  startMonth={new Date(2020, 0)}
  endMonth={new Date(2035, 11)}
/>`,
        render: <CalendarDemo />,
      },
      {
        title: "Bounds and disabled days",
        description:
          "Pass any react-day-picker matcher to `disabled`: a { before } / { after } range, specific dates, or { dayOfWeek } for weekends. Here past dates and weekends are blocked.",
        code: `<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  disabled={[{ before: new Date() }, { dayOfWeek: [0, 6] }]}
/>`,
        render: <CalendarBoundedDemo />,
      },
      {
        title: "Range selection",
        description:
          "Set mode=\"range\" for a start/end selection with a highlighted middle, and numberOfMonths to show more than one month. For a field-styled range picker, use DateRangeField.",
        code: `const [range, setRange] = useState<DateRange>();

<Calendar mode="range" numberOfMonths={2} selected={range} onSelect={setRange} />`,
        render: <CalendarRangeDemo />,
      },
    ],
  },

  "date-field": {
    usage: `import { DateField } from "@flagon-io/ui";

<DateField onChange={(date) => console.log(date)} />`,
    examples: [
      {
        title: "Type or pick",
        description:
          "Type a date in almost any shape (2026-09-17, 9/17/26, Sep 17 2026) and it parses while keeping what you typed, or pick from the calendar. Set dayFirst for EU ordering, and min/max to bound the range.",
        code: `const [date, setDate] = useState<Date | null>(null);

<DateField
  aria-label="Pick a date"
  min={new Date()}                 // no past dates
  disabledDates={{ dayOfWeek: [0, 6] }} // no weekends
  onChange={setDate}
/>`,
        render: <DateFieldDemo />,
      },
    ],
  },

  button: {
    usage: `import { Button } from "@flagon-io/ui";

<Button>Deploy</Button>`,
    examples: [
      {
        title: "Variants",
        code: `<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="link">Link</Button>`,
        render: (
          <>
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </>
        ),
      },
      {
        title: "Icon",
        description: "size=\"icon\" is a square on the same scale as a default button, so icon and text buttons line up.",
        code: `<Button size="icon" aria-label="Add"><Plus /></Button>
<Button variant="outline" size="icon" aria-label="Settings"><Settings /></Button>
<Button variant="ghost" size="icon" aria-label="More"><ChevronDown /></Button>`,
        render: (
          <>
            <Button size="icon" aria-label="Add">
              <Plus className="size-4" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Settings">
              <Settings className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="More">
              <ChevronDown className="size-4" />
            </Button>
          </>
        ),
      },
      {
        title: "Sizes",
        code: `<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>`,
        render: (
          <>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </>
        ),
      },
    ],
  },

  badge: {
    usage: `import { Badge } from "@flagon-io/ui";

<Badge variant="success">Active</Badge>`,
    examples: [
      {
        title: "Variants",
        code: `<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="brand">Brand</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>`,
        render: (
          <>
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="brand">Brand</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
          </>
        ),
      },
    ],
  },

  card: {
    usage: `import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@flagon-io/ui";
import { Button } from "@flagon-io/ui";

<Card>
  <CardHeader>
    <CardTitle>Production</CardTitle>
    <CardDescription>Deployed 2 minutes ago</CardDescription>
  </CardHeader>
  <CardContent>Everything is healthy.</CardContent>
  <CardFooter>
    <Button variant="outline" size="sm">View</Button>
  </CardFooter>
</Card>`,
    examples: [
      {
        code: `<Card className="w-full max-w-sm">
  <CardHeader>
    <CardTitle>Production</CardTitle>
    <CardDescription>Deployed 2 minutes ago</CardDescription>
  </CardHeader>
  <CardContent className="text-sm text-muted-foreground">
    Three services healthy. No incidents in the last 24 hours.
  </CardContent>
  <CardFooter className="gap-2">
    <Button variant="outline" size="sm">View logs</Button>
    <Button size="sm">Open</Button>
  </CardFooter>
</Card>`,
        render: (
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Production</CardTitle>
              <CardDescription>Deployed 2 minutes ago</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Three services healthy. No incidents in the last 24 hours.
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" size="sm">
                View logs
              </Button>
              <Button size="sm">Open</Button>
            </CardFooter>
          </Card>
        ),
      },
    ],
  },

  avatar: {
    usage: `import { Avatar, AvatarImage, AvatarFallback } from "@flagon-io/ui";

<Avatar>
  <AvatarImage src="/me.png" alt="" />
  <AvatarFallback>SQ</AvatarFallback>
</Avatar>`,
    examples: [
      {
        code: `<Avatar className="size-10">
  <AvatarImage src="https://www.flagon.io/icon.svg" alt="" />
  <AvatarFallback>FL</AvatarFallback>
</Avatar>
<Avatar className="size-10">
  <AvatarFallback>SQ</AvatarFallback>
</Avatar>`,
        render: (
          <>
            <Avatar className="size-10">
              <AvatarImage src="https://www.flagon.io/icon.svg" alt="" />
              <AvatarFallback>FL</AvatarFallback>
            </Avatar>
            <Avatar className="size-10">
              <AvatarFallback>SQ</AvatarFallback>
            </Avatar>
          </>
        ),
      },
    ],
  },

  input: {
    usage: `import { Input, Label } from "@flagon-io/ui";

<div className="flex flex-col gap-1.5">
  <Label htmlFor="name">Project name</Label>
  <Input id="name" placeholder="acme-web" />
</div>`,
    examples: [
      {
        code: `<div className="flex w-full max-w-xs flex-col gap-1.5">
  <Label htmlFor="name">Project name</Label>
  <Input id="name" placeholder="acme-web" />
</div>`,
        render: (
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <Label htmlFor="doc-name">Project name</Label>
            <Input id="doc-name" placeholder="acme-web" />
          </div>
        ),
      },
    ],
  },

  label: {
    usage: `import { Label, Input } from "@flagon-io/ui";

<Label htmlFor="email">Email</Label>
<Input id="email" type="email" />`,
    examples: [
      {
        code: `<div className="flex w-full max-w-xs flex-col gap-1.5">
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="you@flagon.dev" />
</div>`,
        render: (
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <Label htmlFor="doc-email">Email</Label>
            <Input id="doc-email" type="email" placeholder="you@flagon.dev" />
          </div>
        ),
      },
    ],
  },

  kbd: {
    usage: `import { Kbd } from "@flagon-io/ui";

<span>Press <Kbd>⌘K</Kbd> to search</span>`,
    examples: [
      {
        code: `<span className="text-sm text-muted-foreground">
  Press <Kbd>⌘K</Kbd> to open search, <Kbd>Esc</Kbd> to close.
</span>`,
        render: (
          <span className="text-sm text-muted-foreground">
            Press <Kbd>⌘K</Kbd> to open search, <Kbd>Esc</Kbd> to close.
          </span>
        ),
      },
    ],
  },

  separator: {
    usage: `import { Separator } from "@flagon-io/ui";

<Separator />
<Separator orientation="vertical" />`,
    examples: [
      {
        code: `<div className="w-full max-w-xs">
  <p className="text-sm font-medium text-foreground">Flagon UI</p>
  <p className="text-sm text-muted-foreground">Component library</p>
  <Separator className="my-3" />
  <div className="flex h-5 items-center gap-3 text-sm text-muted-foreground">
    <span>Docs</span>
    <Separator orientation="vertical" />
    <span>Source</span>
    <Separator orientation="vertical" />
    <span>Registry</span>
  </div>
</div>`,
        render: (
          <div className="w-full max-w-xs">
            <p className="text-sm font-medium text-foreground">Flagon UI</p>
            <p className="text-sm text-muted-foreground">Component library</p>
            <Separator className="my-3" />
            <div className="flex h-5 items-center gap-3 text-sm text-muted-foreground">
              <span>Docs</span>
              <Separator orientation="vertical" />
              <span>Source</span>
              <Separator orientation="vertical" />
              <span>Registry</span>
            </div>
          </div>
        ),
      },
    ],
  },

  dialog: {
    usage: `import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@flagon-io/ui";
import { Button, buttonClasses } from "@flagon-io/ui";

<Dialog>
  <DialogTrigger className={buttonClasses({ variant: "outline" })}>Open</DialogTrigger>
  <DialogContent className="p-6">
    <DialogTitle>Delete project</DialogTitle>
    <DialogDescription>This cannot be undone.</DialogDescription>
  </DialogContent>
</Dialog>`,
    examples: [
      {
        code: `<Dialog>
  <DialogTrigger className={buttonClasses({ variant: "outline" })}>Delete project</DialogTrigger>
  <DialogContent className="p-6">
    <DialogTitle className="text-lg font-semibold">Delete project</DialogTitle>
    <DialogDescription className="mt-1 text-sm text-muted-foreground">
      This permanently removes the project and its deployments.
    </DialogDescription>
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive">Delete</Button>
    </div>
  </DialogContent>
</Dialog>`,
        render: (
          <Dialog>
            <DialogTrigger className={buttonClasses({ variant: "outline" })}>
              Delete project
            </DialogTrigger>
            <DialogContent className="p-6">
              <DialogTitle className="text-lg font-semibold">Delete project</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                This permanently removes the project and its deployments.
              </DialogDescription>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline">Cancel</Button>
                <Button variant="destructive">Delete</Button>
              </div>
            </DialogContent>
          </Dialog>
        ),
      },
    ],
  },

  "color-input": {
    usage: `import { ColorInput } from "@flagon-io/ui";

const [color, setColor] = useState("#0d9488");
<ColorInput value={color} onChange={setColor} />`,
    examples: [
      {
        title: "Hex + HSV picker",
        description:
          "Free-type a hex value, or open the picker: drag the saturation/value area and the hue bar, use the eyedropper (where supported), or click a swatch. This powers the Brand editor.",
        code: `<ColorInput value={color} onChange={setColor} />
<ColorInput compact value={color} onChange={setColor} /> // swatch-only trigger`,
        render: <ColorInputDemo />,
      },
    ],
  },

  slider: {
    usage: `import { Slider } from "@flagon-io/ui";

<Slider defaultValue={[40]} max={100} step={1} onValueChange={setValue} />`,
    examples: [
      {
        title: "Single and range",
        description: "Pass a one-value array for a single thumb, or two values for a range.",
        code: `<Slider value={value} onValueChange={setValue} max={100} step={1} />
<Slider value={[20, 70]} onValueChange={setRange} max={100} step={1} />`,
        render: <SliderDemo />,
      },
    ],
  },

  "dropdown-menu": {
    usage: `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@flagon-io/ui";

<DropdownMenu>
  <DropdownMenuTrigger>Open</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Settings</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
    examples: [
      {
        code: `<DropdownMenu>
  <DropdownMenuTrigger className={buttonClasses({ variant: "outline" })}>
    Open menu <ChevronsUpDown className="size-4" />
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start">
    <DropdownMenuLabel>Actions</DropdownMenuLabel>
    <DropdownMenuItem><Settings /><span>Settings</span></DropdownMenuItem>
    <DropdownMenuItem><Plus /><span>New project</span></DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Sign out</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
        render: (
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonClasses({ variant: "outline" })}>
              Open menu
              <ChevronsUpDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>
                <Settings />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Plus />
                <span>New project</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
  },

  sheet: {
    usage: `import { Sheet, SheetTrigger, SheetContent, SheetTitle } from "@flagon-io/ui";

<Sheet>
  <SheetTrigger>Open</SheetTrigger>
  <SheetContent side="left" className="p-6">
    <SheetTitle>Navigation</SheetTitle>
  </SheetContent>
</Sheet>`,
    examples: [
      {
        code: `<Sheet>
  <SheetTrigger className={buttonClasses({ variant: "outline" })}>Open sheet</SheetTrigger>
  <SheetContent side="left" className="p-6">
    <SheetTitle className="text-lg font-semibold">Navigation</SheetTitle>
    <p className="mt-2 text-sm text-muted-foreground">
      Slides in from the edge; traps focus and closes on Escape.
    </p>
  </SheetContent>
</Sheet>`,
        render: (
          <Sheet>
            <SheetTrigger className={buttonClasses({ variant: "outline" })}>Open sheet</SheetTrigger>
            <SheetContent side="left" className="p-6">
              <SheetTitle className="text-lg font-semibold">Navigation</SheetTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Slides in from the edge; traps focus and closes on Escape.
              </p>
            </SheetContent>
          </Sheet>
        ),
      },
      {
        title: "Directions",
        description: "The `side` prop opens the sheet from any edge: left, right, top, or bottom.",
        code: `{(["left", "right", "top", "bottom"] as const).map((side) => (
  <Sheet key={side}>
    <SheetTrigger className={buttonClasses({ variant: "outline", size: "sm" })}>{side}</SheetTrigger>
    <SheetContent side={side} className="p-6">
      <SheetTitle className="capitalize">{side} sheet</SheetTitle>
      <SheetDescription>Slides in from the {side} edge.</SheetDescription>
    </SheetContent>
  </Sheet>
))}`,
        render: <SheetDirectionsDemo />,
      },
    ],
  },

  tooltip: {
    usage: `import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@flagon-io/ui";

// Wrap your app once in <TooltipProvider>.
<Tooltip>
  <TooltipTrigger>Hover</TooltipTrigger>
  <TooltipContent>Helpful context</TooltipContent>
</Tooltip>`,
    examples: [
      {
        code: `<Tooltip>
  <TooltipTrigger className={buttonClasses({ variant: "outline" })}>Hover me</TooltipTrigger>
  <TooltipContent>Helpful context</TooltipContent>
</Tooltip>`,
        render: (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className={buttonClasses({ variant: "outline" })}>
                Hover me
              </TooltipTrigger>
              <TooltipContent>Helpful context</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
      },
    ],
  },

  tabs: {
    usage: `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@flagon-io/ui";

<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="logs">Logs</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">...</TabsContent>
  <TabsContent value="logs">...</TabsContent>
</Tabs>`,
    examples: [
      {
        code: `<Tabs defaultValue="overview" className="w-full max-w-md">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="logs">Logs</TabsTrigger>
  </TabsList>
  <TabsContent value="overview" className="mt-3 text-sm text-muted-foreground">
    Health, traffic, and recent deployments.
  </TabsContent>
  <TabsContent value="logs" className="mt-3 text-sm text-muted-foreground">
    Streaming logs from every instance.
  </TabsContent>
</Tabs>`,
        render: (
          <Tabs defaultValue="overview" className="w-full max-w-md">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-3 text-sm text-muted-foreground">
              Health, traffic, and recent deployments.
            </TabsContent>
            <TabsContent value="logs" className="mt-3 text-sm text-muted-foreground">
              Streaming logs from every instance.
            </TabsContent>
          </Tabs>
        ),
      },
    ],
  },

  collapsible: {
    usage: `import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@flagon-io/ui";

<Collapsible>
  <CollapsibleTrigger>Toggle</CollapsibleTrigger>
  <CollapsibleContent>Hidden content</CollapsibleContent>
</Collapsible>`,
    examples: [
      {
        code: `<Collapsible className="w-full max-w-sm">
  <CollapsibleTrigger className={buttonClasses({ variant: "outline", size: "sm" })}>
    Environment variables <ChevronDown className="size-4" />
  </CollapsibleTrigger>
  <CollapsibleContent className="mt-2 rounded-lg border border-hairline bg-card p-3 font-mono text-xs text-muted-foreground">
    DATABASE_URL=postgres://...
  </CollapsibleContent>
</Collapsible>`,
        render: (
          <Collapsible className="w-full max-w-sm">
            <CollapsibleTrigger className={buttonClasses({ variant: "outline", size: "sm" })}>
              Environment variables
              <ChevronDown className="size-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 rounded-lg border border-hairline bg-card p-3 font-mono text-xs text-muted-foreground">
              DATABASE_URL=postgres://...
            </CollapsibleContent>
          </Collapsible>
        ),
      },
    ],
  },

  sidebar: {
    usage: `import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarInset, SidebarTrigger,
} from "@flagon-io/ui";

<SidebarProvider>
  <Sidebar collapsible="icon">
    <SidebarContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive tooltip="Dashboard">
            <a href="/"><LayoutDashboard /><span>Dashboard</span></a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarContent>
  </Sidebar>
  <SidebarInset>
    <SidebarTrigger />
    {/* your page */}
  </SidebarInset>
</SidebarProvider>`,
    examples: [
      {
        description:
          'The full system - provider, collapsible modes, mobile Sheet, Cmd/Ctrl+B toggle, rail, and inset. Shown with collapsible="none" so it sits inline.',
        code: `<SidebarProvider>
  <Sidebar collapsible="none" className="w-56 rounded-lg border border-sidebar-border">
    <SidebarHeader>Acme</SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive>
                <LayoutDashboard /><span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Build</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton><Boxes /><span>Projects</span></SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton><Settings /><span>Settings</span></SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</SidebarProvider>`,
        render: (
          <SidebarProvider className="min-h-0 w-auto">
            <Sidebar
              collapsible="none"
              className="h-72 w-56 overflow-hidden rounded-lg border border-sidebar-border"
            >
              <SidebarHeader>
                <div className="flex items-center gap-2 px-1">
                  <span className="flex size-7 items-center justify-center rounded-md bg-brand/15 text-xs font-semibold text-brand-bright">
                    A
                  </span>
                  <span className="text-sm font-semibold text-sidebar-foreground">Acme</span>
                </div>
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton isActive>
                          <LayoutDashboard />
                          <span>Dashboard</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Build</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton>
                          <Boxes />
                          <span>Projects</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton>
                          <Settings />
                          <span>Settings</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
          </SidebarProvider>
        ),
      },
    ],
  },

  checkbox: {
    usage: `import { Checkbox, Label } from "@flagon-io/ui";

<div className="flex items-center gap-2">
  <Checkbox id="terms" />
  <Label htmlFor="terms">Accept terms</Label>
</div>`,
    examples: [
      {
        code: `<div className="flex items-center gap-2">
  <Checkbox id="notify" defaultChecked />
  <Label htmlFor="notify">Email me about deployments</Label>
</div>`,
        render: (
          <div className="flex items-center gap-2">
            <Checkbox id="doc-notify" defaultChecked />
            <Label htmlFor="doc-notify">Email me about deployments</Label>
          </div>
        ),
      },
    ],
  },

  switch: {
    usage: `import { Switch, Label } from "@flagon-io/ui";

<div className="flex items-center gap-3">
  <Switch id="2fa" />
  <Label htmlFor="2fa">Require 2FA</Label>
</div>`,
    examples: [
      {
        code: `<div className="flex items-center gap-3">
  <Switch id="2fa" defaultChecked />
  <Label htmlFor="2fa">Require two-factor authentication</Label>
</div>`,
        render: (
          <div className="flex items-center gap-3">
            <Switch id="doc-2fa" defaultChecked />
            <Label htmlFor="doc-2fa">Require two-factor authentication</Label>
          </div>
        ),
      },
    ],
  },

  textarea: {
    usage: `import { Textarea, Label } from "@flagon-io/ui";

<Label htmlFor="notes">Notes</Label>
<Textarea id="notes" placeholder="What changed?" />`,
    examples: [
      {
        code: `<div className="flex w-full max-w-sm flex-col gap-1.5">
  <Label htmlFor="notes">Release notes</Label>
  <Textarea id="notes" placeholder="What changed in this deploy?" />
</div>`,
        render: (
          <div className="flex w-full max-w-sm flex-col gap-1.5">
            <Label htmlFor="doc-notes">Release notes</Label>
            <Textarea id="doc-notes" placeholder="What changed in this deploy?" />
          </div>
        ),
      },
    ],
  },

  skeleton: {
    usage: `import { Skeleton } from "@flagon-io/ui";

<Skeleton className="h-4 w-40" />`,
    examples: [
      {
        code: `<div className="flex w-full max-w-sm items-center gap-3">
  <Skeleton className="size-10 rounded-full" />
  <div className="flex-1 space-y-2">
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-1/3" />
  </div>
</div>`,
        render: (
          <div className="flex w-full max-w-sm items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ),
      },
    ],
  },

  select: {
    usage: `import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@flagon-io/ui";

<Select>
  <SelectTrigger><SelectValue placeholder="Region" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="iad">Washington, D.C.</SelectItem>
  </SelectContent>
</Select>`,
    examples: [
      {
        code: `<Select defaultValue="iad">
  <SelectTrigger className="w-60"><SelectValue placeholder="Select a region" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="iad">Washington, D.C. (iad)</SelectItem>
    <SelectItem value="sfo">San Francisco (sfo)</SelectItem>
    <SelectItem value="fra">Frankfurt (fra)</SelectItem>
  </SelectContent>
</Select>`,
        render: (
          <Select defaultValue="iad">
            <SelectTrigger className="w-60" aria-label="Region">
              <SelectValue placeholder="Select a region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="iad">Washington, D.C. (iad)</SelectItem>
              <SelectItem value="sfo">San Francisco (sfo)</SelectItem>
              <SelectItem value="fra">Frankfurt (fra)</SelectItem>
            </SelectContent>
          </Select>
        ),
      },
      {
        title: "Adaptive (SelectField)",
        description:
          "Data-driven and device-aware: our themed Radix menu on desktop, the native OS picker on mobile (resize below 768px to see it switch). One call site, best control everywhere.",
        code: `const [region, setRegion] = useState("iad");

<SelectField
  className="w-60"
  placeholder="Select a region"
  value={region}
  onValueChange={setRegion}
  options={[
    { value: "iad", label: "Washington, D.C. (iad)" },
    { value: "sfo", label: "San Francisco (sfo)" },
    { value: "fra", label: "Frankfurt (fra)" },
  ]}
/>`,
        render: <SelectFieldDemo />,
      },
      {
        title: "Render modes",
        description:
          "Force the strategy with `mode`: `auto` (default, native on touch / Radix on desktop), `radix` (always the themed menu), or `native` (always the OS picker, great for long lists).",
        code: `<SelectField mode="radix" options={options} value={a} onValueChange={setA} />
<SelectField mode="native" options={options} value={b} onValueChange={setB} />`,
        render: <SelectModesDemo />,
      },
    ],
  },

  popover: {
    usage: `import { Popover, PopoverTrigger, PopoverContent } from "@flagon-io/ui";

<Popover>
  <PopoverTrigger>Open</PopoverTrigger>
  <PopoverContent>Content</PopoverContent>
</Popover>`,
    examples: [
      {
        code: `<Popover>
  <PopoverTrigger className={buttonClasses({ variant: "outline" })}>Invite</PopoverTrigger>
  <PopoverContent align="start">
    <p className="text-sm font-medium text-foreground">Invite a teammate</p>
    <div className="mt-3 flex gap-2">
      <Input size="sm" placeholder="email@company.com" />
      <Button size="sm">Send</Button>
    </div>
  </PopoverContent>
</Popover>`,
        render: (
          <Popover>
            <PopoverTrigger className={buttonClasses({ variant: "outline" })}>Invite</PopoverTrigger>
            <PopoverContent align="start">
              <p className="text-sm font-medium text-foreground">Invite a teammate</p>
              <div className="mt-3 flex gap-2">
                <Input size="sm" placeholder="email@company.com" />
                <Button size="sm">Send</Button>
              </div>
            </PopoverContent>
          </Popover>
        ),
      },
    ],
  },

  "date-range-field": {
    usage: `import { DateRangeField, type DateRange } from "@flagon-io/ui";

const [range, setRange] = useState<DateRange>();
<DateRangeField value={range} onChange={setRange} />`,
    examples: [
      {
        title: "Pick a range",
        description:
          "A field-styled trigger opens a two-month range calendar. Click a start then an end, or press and drag across the days. Controlled or uncontrolled.",
        code: `<DateRangeField aria-label="Reporting period" onChange={setRange} />`,
        render: <DateRangeFieldDemo />,
      },
    ],
  },

  "money-input": {
    usage: `import { MoneyInput } from "@flagon-io/ui";

<MoneyInput defaultValue={1250} onValueChange={(n) => console.log(n)} />`,
    examples: [
      {
        title: "Shorthand and arithmetic",
        description:
          "Type shorthand (35k, 2.5m, 1b) or a quick sum (5500 + 7300, 2 * 1.5m + 250k). It resolves and formats on blur; the raw number flows out of onValueChange.",
        code: `<MoneyInput defaultValue={1250} onValueChange={setValue} />`,
        render: <MoneyInputDemo />,
      },
      {
        title: "Any currency, optionally user-selectable",
        description:
          "Set `currency` to any ISO code for a fixed currency. Pass `currencies` to let the user switch: the field becomes an input group with a themed currency picker (not a native <select>, so it's dark-mode-correct everywhere). Typing a currency symbol (¥, £, €) or code switches the currency automatically.",
        code: `<MoneyInput
  defaultValue={4200}
  currency={currency}
  currencies={["USD", "EUR", "GBP", "JPY", "CAD"]}
  onCurrencyChange={setCurrency}
  onValueChange={setValue}
/>`,
        render: <MoneyCurrencyDemo />,
      },
    ],
  },

  "input-group": {
    usage: `import { InputGroup } from "@flagon-io/ui";

<InputGroup prefix="app.flagon.io/" placeholder="my-project" />`,
    examples: [
      {
        title: "Prefix and suffix",
        description: "Addons share one bordered, focus-ring container with the field.",
        code: `<InputGroup prefix="app.flagon.io/" placeholder="my-project" />
<InputGroup suffix="USD" placeholder="0.00" inputMode="decimal" />`,
        render: (
          <div className="w-full max-w-sm space-y-3">
            <InputGroup prefix="app.flagon.io/" placeholder="my-project" aria-label="Project slug" />
            <InputGroup suffix="USD" placeholder="0.00" inputMode="decimal" aria-label="Amount" />
          </div>
        ),
      },
    ],
  },

  "input-otp": {
    usage: `import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@flagon-io/ui";

<InputOTP maxLength={6} value={value} onChange={setValue}>
  <InputOTPGroup>
    <InputOTPSlot index={0} />
    ...
  </InputOTPGroup>
</InputOTP>`,
    examples: [
      {
        title: "Six-digit code",
        description: "Paste-aware, split into two groups with a separator.",
        code: `// pattern restricts input (and paste) to digits, so "321-651" pastes as "321651"
<InputOTP maxLength={6} value={value} onChange={setValue} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric">
  <InputOTPGroup>
    <InputOTPSlot index={0} />
    <InputOTPSlot index={1} />
    <InputOTPSlot index={2} />
  </InputOTPGroup>
  <InputOTPSeparator />
  <InputOTPGroup>
    <InputOTPSlot index={3} />
    <InputOTPSlot index={4} />
    <InputOTPSlot index={5} />
  </InputOTPGroup>
</InputOTP>`,
        render: <InputOTPDemo />,
      },
    ],
  },

  accordion: {
    usage: `import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Single, collapsible",
        code: `<Accordion type="single" collapsible>
  <AccordionItem value="1">
    <AccordionTrigger>Question</AccordionTrigger>
    <AccordionContent>Answer</AccordionContent>
  </AccordionItem>
</Accordion>`,
        render: (
          <Accordion type="single" collapsible className="w-full max-w-md">
            <AccordionItem value="1">
              <AccordionTrigger>What is Flagon UI?</AccordionTrigger>
              <AccordionContent>An accessible, token-driven React component library - the one app.flagon.io is built from.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="2">
              <AccordionTrigger>Can I theme it?</AccordionTrigger>
              <AccordionContent>Yes - every component follows the Brand tokens, so one Brand re-skins all of it.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="3">
              <AccordionTrigger>Is it accessible?</AccordionTrigger>
              <AccordionContent>It is built on Radix primitives, so keyboard nav and ARIA come for free.</AccordionContent>
            </AccordionItem>
          </Accordion>
        ),
      },
    ],
  },

  "radio-group": {
    usage: `import { RadioGroup, RadioGroupItem } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Choose one",
        code: `<RadioGroup value={v} onValueChange={setV}>
  <label><RadioGroupItem value="a" /> Option A</label>
</RadioGroup>`,
        render: <RadioGroupDemo />,
      },
    ],
  },

  toggle: {
    usage: `import { Toggle } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<Toggle aria-label="Bold"><Bold /></Toggle>`,
        render: (
          <div className="flex gap-2">
            <Toggle aria-label="Bold">
              <Bold className="size-4" />
            </Toggle>
            <Toggle aria-label="Italic" defaultPressed>
              <Italic className="size-4" />
            </Toggle>
            <Toggle className="w-auto px-3">Toggle</Toggle>
          </div>
        ),
      },
    ],
  },

  "toggle-group": {
    usage: `import { ToggleGroup, ToggleGroupItem } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Segmented (multiple)",
        code: `<ToggleGroup type="multiple">
  <ToggleGroupItem value="bold"><Bold /></ToggleGroupItem>
  ...
</ToggleGroup>`,
        render: <ToggleGroupDemo />,
      },
    ],
  },

  "button-group": {
    usage: `import { ButtonGroup, Button } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<ButtonGroup>
  <Button variant="outline">Day</Button>
  <Button variant="outline">Week</Button>
  <Button variant="outline">Month</Button>
</ButtonGroup>`,
        render: (
          <ButtonGroup>
            <Button variant="outline">Day</Button>
            <Button variant="outline">Week</Button>
            <Button variant="outline">Month</Button>
          </ButtonGroup>
        ),
      },
    ],
  },

  breadcrumb: {
    usage: `import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem><BreadcrumbLink href="#">Home</BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem><BreadcrumbPage>Current</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`,
        render: (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>billing-api</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        ),
      },
    ],
  },

  pagination: {
    usage: `import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<Pagination>
  <PaginationContent>
    <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
    <PaginationItem><PaginationLink href="#" isActive>2</PaginationLink></PaginationItem>
    <PaginationItem><PaginationNext href="#" /></PaginationItem>
  </PaginationContent>
</Pagination>`,
        render: (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">1</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive>
                  2
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#">3</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext href="#" />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ),
      },
    ],
  },

  "alert-dialog": {
    usage: `import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Confirm a destructive action",
        code: `<AlertDialog>
  <AlertDialogTrigger>Delete</AlertDialogTrigger>
  <AlertDialogContent>...</AlertDialogContent>
</AlertDialog>`,
        render: (
          <AlertDialog>
            <AlertDialogTrigger className={buttonClasses({ variant: "destructive" })}>
              Delete project
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This soft-deletes the project. You can restore it later from the trash.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
      },
      {
        title: "Dismissible backdrop",
        description:
          "By design an alert dialog ignores backdrop clicks so a choice can't be skipped. Pass `dismissible` when a click-away (and Escape) should just cancel it.",
        code: `<AlertDialogContent dismissible>
  {/* ...header + footer... */}
</AlertDialogContent>`,
        render: <AlertDialogDismissibleDemo />,
      },
    ],
  },

  "hover-card": {
    usage: `import { HoverCard, HoverCardTrigger, HoverCardContent } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<HoverCard>
  <HoverCardTrigger>@flagon</HoverCardTrigger>
  <HoverCardContent>...</HoverCardContent>
</HoverCard>`,
        render: (
          <HoverCard>
            <HoverCardTrigger className="cursor-default font-medium text-link underline underline-offset-4">
              @flagon
            </HoverCardTrigger>
            <HoverCardContent>
              <div className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-bright">
                  <Star className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Flagon</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    The developer platform you drive from the dashboard, API, or AI.
                  </p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        ),
      },
    ],
  },

  progress: {
    usage: `import { Progress } from "@flagon-io/ui";

<Progress value={66} />`,
    examples: [
      {
        title: "Determinate",
        code: `<Progress value={value} />`,
        render: <ProgressDemo />,
      },
    ],
  },

  spinner: {
    usage: `import { Spinner } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<Spinner />
<Button disabled><Spinner className="size-4" /> Saving...</Button>`,
        render: (
          <div className="flex items-center gap-4">
            <Spinner />
            <Spinner className="size-6 text-brand" />
            <Button disabled>
              <Spinner className="size-4" />
              Saving...
            </Button>
          </div>
        ),
      },
    ],
  },

  empty: {
    usage: `import { Empty } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<Empty icon={<Inbox />} title="No notifications" description="You're all caught up.">
  <Button size="sm">New</Button>
</Empty>`,
        render: (
          <Empty
            className="w-full max-w-md rounded-xl border border-hairline"
            icon={<Inbox className="size-5" />}
            title="No notifications"
            description="You're all caught up. New activity will show up here."
          >
            <Button size="sm" className="mt-1">
              <Plus className="size-4" />
              New
            </Button>
          </Empty>
        ),
      },
    ],
  },

  "aspect-ratio": {
    usage: `import { AspectRatio } from "@flagon-io/ui";

<AspectRatio ratio={16 / 9}>...</AspectRatio>`,
    examples: [
      {
        code: `<AspectRatio ratio={16 / 9} className="rounded-lg bg-muted">...</AspectRatio>`,
        render: (
          <div className="w-full max-w-sm">
            <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg">
              <div className="flex size-full items-center justify-center bg-linear-to-br from-brand/25 to-brand/5 text-sm font-medium text-muted-foreground">
                16 / 9
              </div>
            </AspectRatio>
          </div>
        ),
      },
    ],
  },

  "scroll-area": {
    usage: `import { ScrollArea } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<ScrollArea className="h-48 w-64 rounded-lg border">
  <div className="p-4">...</div>
</ScrollArea>`,
        render: (
          <ScrollArea className="h-48 w-64 rounded-lg border border-hairline">
            {/* Padding goes on the content inside the viewport, never on the
             * ScrollArea root: root padding insets the viewport but not Radix's
             * scrollbar track, which throws off the thumb's position. */}
            <div className="p-4">
              <p className="mb-2 text-sm font-medium text-foreground">Regions</p>
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="border-b border-hairline py-2 text-sm text-muted-foreground last:border-0">
                  Region {i + 1}
                </div>
              ))}
            </div>
          </ScrollArea>
        ),
      },
    ],
  },

  table: {
    usage: `import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<Table>
  <TableHeader><TableRow><TableHead>Project</TableHead>...</TableRow></TableHeader>
  <TableBody><TableRow><TableCell>billing-api</TableCell>...</TableRow></TableBody>
</Table>`,
        render: (
          <Table className="max-w-lg">
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Deploys</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["billing-api", "Live", 128],
                ["web", "Live", 342],
                ["worker", "Paused", 12],
              ].map(([n, s, d]) => (
                <TableRow key={n as string}>
                  <TableCell className="font-medium">{n}</TableCell>
                  <TableCell>{s}</TableCell>
                  <TableCell className="text-right tabular-nums">{d}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ),
      },
    ],
  },

  typography: {
    usage: `import { Prose } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Long-form prose",
        code: `<Prose>
  <h2>Heading</h2>
  <p>Body copy with a <code>code</code> span and a <a href="#">link</a>.</p>
</Prose>`,
        render: (
          <Prose className="max-w-lg">
            <h2>Deploying a project</h2>
            <p>
              Push to <code>main</code> and Flagon builds and ships it - you get a URL, live logs,
              and a one-click rollback.
            </p>
            <ul>
              <li>Automatic preview per branch</li>
              <li>Instant rollbacks</li>
            </ul>
          </Prose>
        ),
      },
    ],
  },

  item: {
    usage: `import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<Item>
  <ItemMedia><Boxes /></ItemMedia>
  <ItemContent><ItemTitle>billing-api</ItemTitle><ItemDescription>Go</ItemDescription></ItemContent>
  <ItemActions><Button size="sm" variant="ghost">Open</Button></ItemActions>
</Item>`,
        render: (
          <div className="w-full max-w-md divide-y divide-hairline rounded-xl border border-hairline">
            {[
              ["billing-api", "Go · deployed 2h ago"],
              ["web", "Next.js · deployed 1d ago"],
            ].map(([name, desc]) => (
              <Item key={name}>
                <ItemMedia>
                  <Boxes className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{name}</ItemTitle>
                  <ItemDescription>{desc}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button size="sm" variant="ghost">
                    Open
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </div>
        ),
      },
    ],
  },

  field: {
    usage: `import { Field, FieldLabel, FieldDescription, FieldError } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Label, description, error",
        code: `<Field>
  <FieldLabel htmlFor="slug">Project slug</FieldLabel>
  <Input id="slug" />
  <FieldDescription>Lowercase letters, numbers, and dashes.</FieldDescription>
</Field>`,
        render: (
          <div className="w-full max-w-xs space-y-4">
            <Field>
              <FieldLabel htmlFor="fld-slug">Project slug</FieldLabel>
              <Input id="fld-slug" defaultValue="billing-api" />
              <FieldDescription>Lowercase letters, numbers, and dashes.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="fld-email">Email</FieldLabel>
              <Input id="fld-email" defaultValue="not-an-email" aria-invalid />
              <FieldError>Enter a valid email address.</FieldError>
            </Field>
          </div>
        ),
      },
    ],
  },

  "context-menu": {
    usage: `import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Right-click the box",
        code: `<ContextMenu>
  <ContextMenuTrigger>Right-click here</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem>Open</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>`,
        render: (
          <ContextMenu>
            <ContextMenuTrigger className="flex h-28 w-full max-w-sm items-center justify-center rounded-lg border border-dashed border-hairline text-sm text-muted-foreground">
              Right-click here
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuLabel>Actions</ContextMenuLabel>
              <ContextMenuItem>
                Open
                <ContextMenuShortcut>⏎</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem>Rename</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-destructive focus:text-destructive">Delete</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ),
      },
    ],
  },

  menubar: {
    usage: `import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator, MenubarShortcut } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<Menubar>
  <MenubarMenu>
    <MenubarTrigger>File</MenubarTrigger>
    <MenubarContent><MenubarItem>New</MenubarItem></MenubarContent>
  </MenubarMenu>
</Menubar>`,
        render: (
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  New Project
                  <MenubarShortcut>⌘N</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>Open…</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>Settings</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>Edit</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  Undo
                  <MenubarShortcut>⌘Z</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>Redo</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>View</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>Deployments</MenubarItem>
                <MenubarItem>Logs</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        ),
      },
    ],
  },

  "navigation-menu": {
    usage: `import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink } from "@flagon-io/ui";`,
    examples: [
      {
        code: `<NavigationMenu>
  <NavigationMenuList>
    <NavigationMenuItem>
      <NavigationMenuTrigger>Product</NavigationMenuTrigger>
      <NavigationMenuContent>...</NavigationMenuContent>
    </NavigationMenuItem>
  </NavigationMenuList>
</NavigationMenu>`,
        render: (
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Product</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-64 gap-1 p-2">
                    <NavigationMenuLink className="cursor-pointer rounded-md px-3 py-2 text-sm text-foreground hover:bg-panel">
                      Projects
                    </NavigationMenuLink>
                    <NavigationMenuLink className="cursor-pointer rounded-md px-3 py-2 text-sm text-foreground hover:bg-panel">
                      Deployments
                    </NavigationMenuLink>
                    <NavigationMenuLink className="cursor-pointer rounded-md px-3 py-2 text-sm text-foreground hover:bg-panel">
                      Logs
                    </NavigationMenuLink>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  href="#"
                  className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-foreground hover:bg-panel"
                >
                  Docs
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        ),
      },
    ],
  },

  combobox: {
    usage: `import { Combobox } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Searchable select",
        description: "A Popover + Command pairing with typeahead filtering and keyboard nav.",
        code: `<Combobox
  options={regions}
  value={value}
  onValueChange={setValue}
  placeholder="Select a region"
/>`,
        render: <ComboboxDemo />,
      },
      {
        title: "Server-backed typeahead",
        description:
          "Pass loadOptions instead of options and it re-queries as you type rather than filtering a static list, so it works over lists too large to send at once (pairs with a paginated ?q= endpoint).",
        code: `<Combobox
  loadOptions={async (q) => searchRegions(q)}
  value={value}
  onValueChange={setValue}
  placeholder="Find a region"
/>`,
        render: <AsyncComboboxDemo />,
      },
    ],
  },

  command: {
    usage: `import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Inline palette",
        description: "Wrap it in <CommandDialog> for a ⌘K overlay.",
        code: `<Command>
  <CommandInput placeholder="Type a command…" />
  <CommandList>
    <CommandGroup heading="Projects">
      <CommandItem>billing-api</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>`,
        render: <CommandDemo />,
      },
    ],
  },

  drawer: {
    usage: `import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Bottom sheet",
        description: "Draggable and dismissible; set direction=\"right\" for a side sheet.",
        code: `<Drawer>
  <DrawerTrigger asChild><Button variant="outline">Open drawer</Button></DrawerTrigger>
  <DrawerContent>...</DrawerContent>
</Drawer>`,
        render: <DrawerDemo />,
      },
      {
        title: "Directions",
        description: "The `direction` prop drags the drawer in from any edge: bottom, right, left, or top.",
        code: `<Drawer direction="right">
  <DrawerTrigger asChild><Button variant="outline">Right</Button></DrawerTrigger>
  <DrawerContent>...</DrawerContent>
</Drawer>`,
        render: <DrawerDirectionsDemo />,
      },
    ],
  },

  toast: {
    usage: `import { Toaster, toast } from "@flagon-io/ui";

// mount once near the root
<Toaster />
// then anywhere
toast.success("Deployed");`,
    examples: [
      {
        title: "Notifications",
        description: "Sonner-backed, themed to Flagon tokens so it follows light/dark and the Brand.",
        code: `toast("Deployment queued", { description: "billing-api → production" });
toast.success("Deployed", { description: "Live in 42s" });
toast.error("Build failed", { action: { label: "Retry", onClick: retry } });`,
        render: <ToastDemo />,
      },
    ],
  },

  carousel: {
    usage: `import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Swipeable slides",
        description: "Embla-powered; drag, arrow keys, or the prev/next buttons.",
        code: `<Carousel className="w-full max-w-xs">
  <CarouselContent>
    <CarouselItem>...</CarouselItem>
  </CarouselContent>
  <CarouselPrevious />
  <CarouselNext />
</Carousel>`,
        render: <CarouselDemo />,
      },
    ],
  },

  chart: {
    usage: `import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@flagon-io/ui";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

const config = {
  deploys: { label: "Deploys", color: "var(--color-brand)" },
  rollbacks: { label: "Rollbacks", color: "var(--color-muted-foreground)" },
} satisfies ChartConfig;`,
    examples: [
      {
        title: "The chart container",
        description:
          "Every chart wraps a Recharts tree in <ChartContainer config={...}>. The config maps each series to a label and a token color, exposed to the SVG as --color-<key>, so charts follow the active Brand and light/dark. ChartTooltipContent and ChartLegendContent read the same config.",
        code: `<ChartContainer config={config}>
  <BarChart data={data}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="month" tickLine={false} axisLine={false} />
    <ChartTooltip content={<ChartTooltipContent />} />
    <ChartLegend content={<ChartLegendContent />} />
    <Bar dataKey="deploys" fill="var(--color-deploys)" radius={4} />
    <Bar dataKey="rollbacks" fill="var(--color-rollbacks)" radius={4} />
  </BarChart>
</ChartContainer>`,
        render: <ChartDemo />,
      },
    ],
  },

  "area-chart": {
    usage: `import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@flagon-io/ui";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";`,
    examples: [
      {
        title: "Gradient area",
        description: "A filled line for trends. The fill is a <linearGradient> keyed off the series color token.",
        code: `<AreaChart data={data}>
  <defs>
    <linearGradient id="fillDeploys" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="var(--color-deploys)" stopOpacity={0.7} />
      <stop offset="95%" stopColor="var(--color-deploys)" stopOpacity={0.05} />
    </linearGradient>
  </defs>
  <XAxis dataKey="month" />
  <ChartTooltip content={<ChartTooltipContent />} />
  <Area dataKey="deploys" type="natural" fill="url(#fillDeploys)" stroke="var(--color-deploys)" />
</AreaChart>`,
        render: <AreaChartDemo />,
      },
    ],
  },

  "bar-chart": {
    usage: `import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@flagon-io/ui";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";`,
    examples: [
      {
        title: "Stacked bars",
        description: "Share a `stackId` to stack series; round only the outer corners of the stack.",
        code: `<BarChart data={data}>
  <XAxis dataKey="month" />
  <ChartTooltip content={<ChartTooltipContent />} />
  <Bar dataKey="deploys" stackId="a" fill="var(--color-deploys)" radius={[0, 0, 4, 4]} />
  <Bar dataKey="rollbacks" stackId="a" fill="var(--color-rollbacks)" radius={[4, 4, 0, 0]} />
</BarChart>`,
        render: <BarChartStackedDemo />,
      },
    ],
  },

  "line-chart": {
    usage: `import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@flagon-io/ui";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";`,
    examples: [
      {
        title: "Multi-series line",
        description: "Plot several series over a continuous axis; each Line reads its own color token.",
        code: `<LineChart data={data}>
  <XAxis dataKey="month" />
  <ChartTooltip content={<ChartTooltipContent />} />
  <Line dataKey="deploys" type="monotone" stroke="var(--color-deploys)" dot={false} />
  <Line dataKey="rollbacks" type="monotone" stroke="var(--color-rollbacks)" dot={false} />
</LineChart>`,
        render: <LineChartDemo />,
      },
    ],
  },

  "pie-chart": {
    usage: `import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@flagon-io/ui";
import { Cell, Pie, PieChart } from "recharts";`,
    examples: [
      {
        title: "Donut",
        description: "Set `innerRadius` for a donut. Give each slice a color via <Cell> from the chart palette.",
        code: `<PieChart>
  <ChartTooltip content={<ChartTooltipContent nameKey="runtime" hideLabel />} />
  <Pie data={data} dataKey="projects" nameKey="runtime" innerRadius={48}>
    {data.map((d) => <Cell key={d.runtime} fill={d.fill} />)}
  </Pie>
</PieChart>`,
        render: <PieChartDemo />,
      },
    ],
  },

  "radar-chart": {
    usage: `import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@flagon-io/ui";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";`,
    examples: [
      {
        title: "Health radar",
        description: "Compare several quantitative axes on a shared origin.",
        code: `<RadarChart data={data}>
  <PolarGrid />
  <PolarAngleAxis dataKey="axis" />
  <ChartTooltip content={<ChartTooltipContent />} />
  <Radar dataKey="score" stroke="var(--color-score)" fill="var(--color-score)" fillOpacity={0.35} />
</RadarChart>`,
        render: <RadarChartDemo />,
      },
    ],
  },

  "radial-chart": {
    usage: `import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@flagon-io/ui";
import { Cell, RadialBar, RadialBarChart } from "recharts";`,
    examples: [
      {
        title: "Radial bars",
        description: "A circular, progress-style bar chart for a handful of values.",
        code: `<RadialBarChart data={data} innerRadius={30} outerRadius={110} startAngle={90} endAngle={-270}>
  <ChartTooltip content={<ChartTooltipContent nameKey="runtime" hideLabel />} />
  <RadialBar dataKey="projects" background cornerRadius={6}>
    {data.map((d) => <Cell key={d.runtime} fill={d.fill} />)}
  </RadialBar>
</RadialBarChart>`,
        render: <RadialChartDemo />,
      },
    ],
  },

  "data-table": {
    usage: `import { DataTable, type ColumnDef } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Sortable, filterable, paginated",
        description: "Built on TanStack Table over the Flagon Table primitives. Click a header to sort.",
        code: `<DataTable
  columns={columns}
  data={rows}
  filterColumn="project"
  pageSize={4}
/>`,
        render: <DataTableDemo />,
      },
      {
        title: "Full toolbar: faceted filter, column toggle, selection",
        description:
          "Pass `toolbar` a function of the live table to add column-level controls like <DataTableFacetedFilter>, turn on `enableColumnVisibility`, and rows become selectable. Give the filtered column a `filterFn` so the facet's multi-select applies.",
        code: `const columns = [
  // ...
  { accessorKey: "status", header: "Status",
    filterFn: (row, id, value) => value.includes(row.getValue(id)) },
];

<DataTable
  columns={columns}
  data={rows}
  filterColumn="project"
  enableColumnVisibility
  pageSize={4}
  toolbar={(table) => (
    <DataTableFacetedFilter
      column={table.getColumn("status")}
      title="Status"
      options={statusOptions}
    />
  )}
/>`,
        render: <DataTablePowerDemo />,
      },
    ],
  },

  resizable: {
    usage: `import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@flagon-io/ui";`,
    examples: [
      {
        title: "Nested panels",
        description: "Drag the handles; nest groups to mix horizontal and vertical splits.",
        code: `<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={30}>Sidebar</ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize={70}>Editor</ResizablePanel>
</ResizablePanelGroup>`,
        render: <ResizableDemo />,
      },
    ],
  },

};

"use client";

import { useState, type ReactNode } from "react";
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
} from "lucide-react";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Badge,
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
  DateField,
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
  Kbd,
  Label,
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
} from "@flagon-io/ui";

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

function SelectFieldDemo() {
  const [region, setRegion] = useState("iad");
  return (
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
<Button variant="destructive">Destructive</Button>`,
        render: (
          <>
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
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
            <SelectTrigger className="w-60">
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
      <Input placeholder="email@company.com" />
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
                <Input placeholder="email@company.com" />
                <Button size="sm">Send</Button>
              </div>
            </PopoverContent>
          </Popover>
        ),
      },
    ],
  },
};

"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorPicker } from "./ColorPicker";
import { SchemeSwitcher } from "./SchemeSwitcher";
import { SectionsPanel } from "./SectionsPanel";

export type PanelTab = "sections" | "colors" | "schemes";

interface Props {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  className?: string;
}

export function SidePanel({ tab, onTabChange, collapsed, onCollapsedChange, className }: Props) {
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => {
        onTabChange(v as PanelTab);
        onCollapsedChange(false);
      }}
      className={cn("flex min-h-0 flex-col gap-0 bg-background", className)}
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <TabsList className="h-10 flex-1 lg:w-full">
          <TabsTrigger value="sections" className="h-full">Sections</TabsTrigger>
          <TabsTrigger value="colors" className="h-full">Colours</TabsTrigger>
          <TabsTrigger value="schemes" className="h-full">Schemes</TabsTrigger>
        </TabsList>
        <button
          type="button"
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          aria-expanded={!collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
        >
          <ChevronDown className={cn("size-5 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 lg:p-4", collapsed && "hidden lg:block")}>
        <TabsContent value="sections">
          <SectionsPanel onPickColor={() => onTabChange("colors")} />
        </TabsContent>
        <TabsContent value="colors">
          <ColorPicker />
        </TabsContent>
        <TabsContent value="schemes">
          <SchemeSwitcher />
        </TabsContent>
      </div>
    </Tabs>
  );
}

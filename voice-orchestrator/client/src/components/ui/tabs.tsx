import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>');
  return ctx;
}

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

function Tabs({ defaultValue, value, onValueChange, className, children }: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue);
  const activeTab = value ?? internal;
  const setActiveTab = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
  };
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'inline-flex h-10 items-center justify-start rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

function TabsTrigger({ value, disabled, className, children }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabs();
  const isActive = activeTab === value;
  return (
    <button
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        isActive && 'bg-background text-foreground shadow-sm',
        className,
      )}
    >
      {children}
    </button>
  );
}

function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { activeTab } = useTabs();
  if (activeTab !== value) return null;
  return (
    <div
      className={cn(
        'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };

"use client";

import { useEffect, useState, type ReactNode } from "react";

interface ConfigTab {
  id: string;
  label: string;
  icon: string;
  content: ReactNode;
}

interface ConfigTabsProps {
  tabs: ConfigTab[];
  initialTabId?: string;
}

function resolveActiveTab(tabs: ConfigTab[], requestedTabId?: string) {
  if (requestedTabId && tabs.some((tab) => tab.id === requestedTabId)) {
    return requestedTabId;
  }

  return tabs[0]?.id ?? "";
}

export default function ConfigTabs({ tabs, initialTabId }: ConfigTabsProps) {
  const [activeTab, setActiveTab] = useState(() => resolveActiveTab(tabs, initialTabId));

  useEffect(() => {
    if (!initialTabId) {
      return;
    }

    const nextTab = resolveActiveTab(tabs, initialTabId);
    setActiveTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab));
  }, [initialTabId]);

  const activeTabData = tabs.find((t) => t.id === activeTab);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Tab Bar */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          overflowX: "auto",
          paddingBottom: "2px",
          scrollbarWidth: "none",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flexShrink: 0,
              padding: "10px 16px",
              borderRadius: "var(--radius)",
              border:
                activeTab === tab.id
                  ? "1px solid var(--primary)"
                  : "1px solid var(--border)",
              background: activeTab === tab.id ? "var(--primary)" : "var(--surface)",
              color: activeTab === tab.id ? "#000" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: "16px" }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>{activeTabData?.content}</div>
    </div>
  );
}

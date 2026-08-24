import { Children, cloneElement, isValidElement, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Group, Panel, Separator, useDefaultLayout, usePanelCallbackRef } from 'react-resizable-panels';
import type { Layout, PanelImperativeHandle } from 'react-resizable-panels';
import { useShell } from '../../shell/ShellContext';

/**
 * Site-wide Common Resizable Pane Layout Engine(react-resizable-panels v4). 
 *
 * usage: 
 *   <Workspace storageKey="kms.layout.literature" defaultLayout={[20,55,25]}
 *              minSizes={[12,35,15]} maxSizes={[30,undefined,35]}>
 *     <Pane title="Collections">...</Pane>
 *     <Handle />          <- position mark, RenderasCanDragDivider
 *     <Pane title="Papers">...</Pane>
 *     <Handle />
 *     <Pane title="Inspector">...</Pane>
 *   </Workspace>
 *
 * - Layout persisted to localStorage(key: react-resizable-panels:kms.layout.<storageKey>:...)
 * - Double-click divider restores default width(vaultBuilt-inBehavior)
 * - Collapse/Resume: Dragged minSize Collapse, Title bar button or drag back restore
 * - Settingsin "Reset All Layouts"via layoutResetVersion force rebuild
 */

export interface PaneProps {
  id?: string;
  title: string;
  actions?: ReactNode;
  shaded?: boolean;
  stack?: boolean;
  children: ReactNode;
}

interface PaneHostProps extends PaneProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Pane({ title, actions, shaded, stack, children, collapsed, onToggleCollapse }: PaneHostProps) {
  if (collapsed && onToggleCollapse) {
    return (
      <section className="ws-panel ws-panel-collapsed">
        <button type="button" className="ws-collapsed-bar" title={`${title}(Click Expand)`} onClick={onToggleCollapse}>
          <ChevronsRight size={13} aria-hidden="true" />
          <span className="ws-collapsed-title">{title}</span>
        </button>
      </section>
    );
  }

  return (
    <section className={`ws-panel ${shaded ? 'is-shaded' : ''}`}>
      <div className="ws-panel-titlebar">
        <span className="ws-panel-title">{title}</span>
        {actions && <div className="ws-panel-actions">{actions}</div>}
        {onToggleCollapse && (
          <button type="button" className="icon-btn" title="Collapse this" onClick={onToggleCollapse}>
            <ChevronsLeft size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={`ws-panel-body${stack ? ' ws-panel-body--stack' : ''}`}>{children}</div>
    </section>
  );
}

/** position mark: Workspace put itReplaceintoCanDragDivider, itself notRenderany content.  */
export function Handle() {
  return null;
}

interface PaneHostContainerProps {
  pane: ReactElement<PaneHostProps>;
  id: string;
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
}

function PaneHostContainer({ pane, id, defaultSize, minSize, maxSize }: PaneHostContainerProps) {
  const [panelApi, setPanelApi] = usePanelCallbackRef();
  const [collapsed, setCollapsed] = useState(false);

  const toggle = () => {
    if (!panelApi) return;
    if (panelApi.isCollapsed()) {
      panelApi.expand();
      setCollapsed(false);
    } else {
      panelApi.collapse();
      setCollapsed(true);
    }
  };

  const child = cloneElement(pane, { collapsed, onToggleCollapse: toggle });

  return (
    <Panel
      id={id}
      className="ws-panel-outer"
      defaultSize={`${defaultSize}%`}
      minSize={minSize !== undefined ? `${minSize}%` : undefined}
      maxSize={maxSize !== undefined ? `${maxSize}%` : undefined}
      collapsible
      collapsedSize={28}
      panelRef={setPanelApi}
      onResize={() => {
        if (panelApi) setCollapsed(panelApi.isCollapsed());
      }}
    >
      {child}
    </Panel>
  );
}

export interface WorkspaceProps {
  /** Layout Persistence key, Like kms.layout.literature */
  storageKey: string;
  /** Default Width(Percent, andas 100) */
  defaultLayout: number[];
  /** Each Pane mostSmallwidth(Percent) */
  minSizes?: number[];
  /** Each Pane mostLargewidth(Percent, undefined Tableshow unlimited) */
  maxSizes?: (number | undefined)[];
  /** Responsive: First Open(No Saved Layout)whenByviewport widthCollapseLeftRight Panel */
  responsive?: { collapseRightBelow?: number; collapseLeftBelow?: number };
  children: ReactNode;
}

function paneId(element: ReactElement<PaneHostProps>, index: number): string {
  return element.props?.id || `pane-${index}`;
}

export function Workspace({
  storageKey,
  defaultLayout,
  minSizes,
  maxSizes,
  responsive,
  children
}: WorkspaceProps) {
  const { layoutResetVersion } = useShell();
  const childrenArray = Children.toArray(children);
  const panes = childrenArray.filter(
    (child): child is ReactElement<PaneHostProps> => isValidElement(child) && child.type === Pane
  );
  const panelIds = panes.map((pane, index) => paneId(pane, index));

  const { defaultLayout: savedLayout, onLayoutChanged } = useDefaultLayout({
    id: storageKey,
    panelIds,
    onlySaveAfterUserInteractions: true
  });

  // hasSavedLayoutwhen optimizeFirstResume; else useDefault Value, and fold first by responsive rules/Last Column. 
  const initialLayout = useMemo<Layout>(() => {
    if (savedLayout) return savedLayout;
    const layout: Layout = {};
    panes.forEach((pane, index) => {
      layout[panelIds[index]] = defaultLayout[index] ?? Math.round(100 / panes.length);
    });
    if (responsive && panes.length > 2) {
      const width = window.innerWidth;
      if (responsive.collapseLeftBelow && width < responsive.collapseLeftBelow) {
        layout[panelIds[0]] = 0;
      }
      if (responsive.collapseRightBelow && width < responsive.collapseRightBelow) {
        layout[panelIds[panes.length - 1]] = 0;
      }
    }
    return layout;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLayout]);

  let paneIndex = -1;
  const content = childrenArray.map((child, index) => {
    if (!isValidElement(child)) return child;
    if (child.type === Handle) {
      return <Separator key={`sep-${index}`} className="ws-separator" />;
    }
    if (child.type === Pane) {
      paneIndex += 1;
      const idx = paneIndex;
      const id = panelIds[idx];
      return (
        <PaneHostContainer
          key={id}
          pane={child as ReactElement<PaneHostProps>}
          id={id}
          defaultSize={defaultLayout[idx] ?? Math.round(100 / panes.length)}
          minSize={minSizes?.[idx]}
          maxSize={maxSizes?.[idx]}
        />
      );
    }
    return child;
  });

  return (
    <Group
      key={layoutResetVersion}
      id={storageKey}
      className="ws"
      defaultLayout={initialLayout}
      onLayoutChanged={onLayoutChanged}
    >
      {content}
    </Group>
  );
}

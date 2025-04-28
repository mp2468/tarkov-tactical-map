import React, {
  useRef,
  useState,
  useEffect,
  MouseEvent,
  WheelEvent,
  ChangeEvent,
} from 'react';
import { motion } from 'framer-motion';

/**
 * ============================================================================
 * Real‑Time Map Communication — Expanded, Commented Build v4.3
 * ---------------------------------------------------------------------------
 *  ✓ Pan & Zoom (Ctrl‑drag, mouse‑wheel, ± buttons) with clamp so the
 *    background never drifts fully off‑screen.
 *  ✓ Drawing tools: pen, arrow, circle, emoji — each stroke records user name,
 *    colour, thickness, tool, optional fade‑out timer.
 *  ✓ Number‑key shortcuts (1‑4) to set thickness (5/10/15/20 px).
 *  ✓ Radial “pie” context menu (right‑click):
 *      • Left semicircle = user colours.
 *      • Right semicircle = tools.
 *      • Selection commits on click *or* hover‑and‑drag‑out.
 *      • Central × closes without change.
 *  ✓ Background image upload + optional lock.
 *  ✓ Connected‑user list, dev console, collapsible settings panel.
 *  ✓ Placeholder API: POST full drawing list on each change + 10 s poller.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/*                              Type Declarations                              */
/* -------------------------------------------------------------------------- */

type ToolType = 'pen' | 'arrow' | 'circle' | 'emoji';

interface DrawAction {
  userId: string;
  userName: string;
  color: string;
  tool: ToolType;
  lineWidth: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  emoji?: string;
  // @ts-ignore should be infinity or number
  expireAt?: number | Infinity;
}

interface User {
  userId: string;
  userName: string;
  color: string;
}

/* -------------------------------------------------------------------------- */
/*                                Constants                                    */
/* -------------------------------------------------------------------------- */

// Distinct palette for users
const COLOUR_POOL: string[] = [
  '#ef4444', // red
  '#f59e0b', // orange
  '#eab308', // yellow
  '#84cc16', // lime
  '#22d3ee', // cyan
  '#a855f7', // purple
  '#f472b6', // pink
  '#ffffff', // white
];

const TOOL_LIST: ToolType[] = ['pen', 'arrow', 'circle', 'emoji'];

// Thickness preset map for number‑key shortcuts
const THICK_PRESETS: Record<number, number> = {
  1: 5,
  2: 10,
  3: 15,
  4: 20,
};

const EMOJIS: string[] = ['😀', '🤩', '🔥', '🚀', '❤️', '👍'];

/* Fade timer options */
const FADE_OPTIONS = [
  { label: '10 s', value: '10s', ms: 10_000 },
  { label: '30 s', value: '30s', ms: 30_000 },
  { label: '1 min', value: '1m', ms: 60_000 },
  { label: '5 min', value: '5m', ms: 300_000 },
  { label: '10 min', value: '10m', ms: 600_000 },
  { label: 'Permanent', value: 'permanent', ms: Infinity },
];

const fadeToMs = (v: string): number =>
  FADE_OPTIONS.find((o) => o.value === v)?.ms ?? Infinity;

/* -------------------------------------------------------------------------- */
/*                               Math Helpers                                  */
/* -------------------------------------------------------------------------- */

/** Convert polar coordinate (r, deg) to cartesian */
const polar = (r: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
};

/** SVG path for a “slice” arc between two angles */
const arcPath = (r: number, a0: number, a1: number) => {
  const p0 = polar(r, a0);
  const p1 = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M0 0 L${p0.x} ${p0.y} A${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
};

/** Mid‑point of an arc (used for tool labels) */
const midPoint = (r: number, a0: number, a1: number) =>
  polar(r * 0.6, (a0 + a1) / 2);

/* -------------------------------------------------------------------------- */
/*                              React Component                                */
/* -------------------------------------------------------------------------- */

const RealTimeMapApp: React.FC = () => {
  /* ──────────────────────────────── User State ───────────────────────────── */
  const [userId] = useState(() => 'u' + Math.floor(Math.random() * 1e6));
  const [userName, setUserName] = useState('Guest');
  const [userColour, setUserColour] = useState(COLOUR_POOL[0]);
  const [userList, setUserList] = useState<User[]>([]);

  /* ───────────────────────────── Drawing State ───────────────────────────── */
  const [currentTool, setCurrentTool] = useState<ToolType>('arrow');
  const [lineWidth, setLineWidth] = useState(10);
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0]);
  const [fadeSetting, setFadeSetting] = useState('permanent');
  const [actions, setActions] = useState<DrawAction[]>([]);

  /* Canvas refs & view transforms */
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const isDrawing = useRef(false);
  const drawStart = useRef({ x: 0, y: 0 });

  /* Background image */
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgLocked, setBgLocked] = useState(false);

  /* UI toggles */
  const [panelOpen, setPanelOpen] = useState(true);
  const [devOpen, setDevOpen] = useState(false);

  /* Radial context menu */
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [hoverId, setHoverId] = useState('');

  /* ─────────────────── Keyboard shortcut: thickness preset ───────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const preset = THICK_PRESETS[+e.key as 1 | 2 | 3 | 4];
      if (preset) {
        setLineWidth(preset);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ─────────────────────────────── Undo Shortcuts ─────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Backspace → undo last stroke
      if (e.key === 'Backspace') {
        setActions((prev) => prev.slice(0, -1));
        e.preventDefault();
        return;
      }

      // Ctrl/Cmd + Z → undo
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
        setActions((prev) => prev.slice(0, -1));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ───────────────────────── Sync user list array ────────────────────────── */
  useEffect(() => {
    setUserList((prev) => {
      const idx = prev.findIndex((u) => u.userId === userId);
      const next = [...prev];
      if (idx >= 0) next[idx] = { userId, userName, color: userColour };
      else next.push({ userId, userName, color: userColour });
      return next;
    });
  }, [userName, userColour]);

  /* ─────────────────────────── Fade‑out timer trim ───────────────────────── */
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setActions((prev) =>
        prev.filter((act) => !act.expireAt || act.expireAt === Infinity || now < act.expireAt),
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  /* ───────────── Placeholder API: POST on change + polling in ────────────── */
  useEffect(() => {
    if (actions.length === 0) return;
    console.debug('[API‑POST] /api/drawings', JSON.stringify(actions));
    // fetch('/api/drawings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(actions) });
  }, [actions]);

  useEffect(() => {
    const poll = setInterval(() => {
      console.debug('[API‑GET] polling /api/drawings');
      // fetch('/api/drawings').then(r=>r.json()).then(serverData=>setActions(serverData))
    }, 10_000);
    return () => clearInterval(poll);
  }, []);

  /* ------------------------------------------------------------------------ */
  /*                          Coordinate Converters                           */
  /* ------------------------------------------------------------------------ */

  /** Screen → world coordinate conversion */
  const screenToWorld = (sx: number, sy: number) => {
    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (!canvas) return { x: sx, y: sy };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (sx - rect.left) / scale + pan.x,
      y: (sy - rect.top) / scale + pan.y,
    };
  };

  /** Ensure panning doesn’t over‑scroll past background edges */
  const clampPan = (px: number, py: number, sc: number) => {
    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (!canvas || !bgImage) return { x: px, y: py };

    const maxX = Math.max(0, bgImage.width - canvas.width / sc);
    const maxY = Math.max(0, bgImage.height - canvas.height / sc);

    return {
      x: Math.min(Math.max(0, px), maxX),
      y: Math.min(Math.max(0, py), maxY),
    };
  };

  /* ------------------------------------------------------------------------ */
  /*                           Draw Action Helpers                            */
  /* ------------------------------------------------------------------------ */

  /** Push a new drawing stroke into state */
  const pushAction = (tool: ToolType, start: { x: number; y: number }, end: { x: number; y: number }) => {
    setActions((prev) => [
      ...prev,
      {
        userId,
        userName,
        color: userColour,
        tool,
        lineWidth,
        start,
        end,
        emoji: selectedEmoji,
        expireAt: Date.now() + fadeToMs(fadeSetting),
      },
    ]);
  };

  /* ------------------------------------------------------------------------ */
  /*                               Mouse Logic                                */
  /* ------------------------------------------------------------------------ */

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Right‑click opens radial menu
    if (e.button === 2) {
      e.preventDefault();
      setMenuPos({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
      return;
    }

    // If menu is open and user clicks elsewhere, close it
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }

    // Ctrl + left drag → panning
    if (e.ctrlKey) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Otherwise begin drawing
    isDrawing.current = true;
    drawStart.current = screenToWorld(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    /* Panning logic */
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;

      setPan((prev) => clampPan(prev.x - dx / scale, prev.y - dy / scale, scale));
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    /* Freeform pen drawing (continuous) */
    if (isDrawing.current && currentTool === 'pen') {
      const start = drawStart.current;
      const end = screenToWorld(e.clientX, e.clientY);
      pushAction('pen', start, end);
      drawStart.current = end; // Continue stroke
    }
  };

  const handleMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }

    if (!isDrawing.current) return;
    isDrawing.current = false;

    const endPt = screenToWorld(e.clientX, e.clientY);
    pushAction(currentTool, drawStart.current, endPt);
  };

  /* ------------------------------------------------------------------------ */
  /*                              Wheel Zoom                                  */
  /* ------------------------------------------------------------------------ */

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (!canvas) return;

    // Mouse position relative to canvas
    const rect = canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    // Determine new scale
    let newScale = scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1);
    newScale = Math.min(Math.max(1, newScale), 4);

    // Keep world coordinates under mouse pointer constant
    const worldX = localX / scale + pan.x;
    const worldY = localY / scale + pan.y;
    const newPan = clampPan(worldX - localX / newScale, worldY - localY / newScale, newScale);

    setScale(newScale);
    setPan(newPan);
  };

  /** Zoom via ± buttons */
  const zoomByFactor = (factor: number) => {
    let newScale = scale * factor;
    newScale = Math.min(Math.max(1, newScale), 4);

    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (!canvas) {
      setScale(newScale);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const worldX = centerX / scale + pan.x;
    const worldY = centerY / scale + pan.y;

    setScale(newScale);
    setPan(clampPan(worldX - centerX / newScale, worldY - centerY / newScale, newScale));
  };

  /* ------------------------------------------------------------------------ */
  /*                               Canvas Paint                               */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const canvas = canvasContainerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to fill viewport each render (simple approach)
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.save();

    // Apply pan + zoom
    ctx.translate(-pan.x * scale, -pan.y * scale);
    ctx.scale(scale, scale);

    // Clear viewport in world‑space coords
    ctx.clearRect(pan.x, pan.y, canvas.width / scale, canvas.height / scale);

    // Draw background first (if present)
    if (bgImage) ctx.drawImage(bgImage, 0, 0);

    // Draw each stored action
    actions.forEach((act) => {
      ctx.strokeStyle = act.color;
      ctx.lineWidth = act.lineWidth;

      switch (act.tool) {
        case 'pen': {
          ctx.beginPath();
          ctx.moveTo(act.start.x, act.start.y);
          ctx.lineTo(act.end.x, act.end.y);
          ctx.stroke();
          break;
        }
        case 'arrow':
          drawArrow(ctx, act);
          break;
        case 'circle':
          drawCircle(ctx, act);
          break;
        case 'emoji':
          ctx.font = '32px sans-serif';
          ctx.fillText(act.emoji || '😀', act.end.x, act.end.y);
          break;
      }
    });

    ctx.restore();
  }, [actions, bgImage, pan, scale]);

  /* ------------------------------------------------------------------------ */
  /*                          File Upload (Background)                        */
  /* ------------------------------------------------------------------------ */

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (bgLocked) return;

    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (typeof evt.target?.result !== 'string') return;
      const img = new Image();
      img.src = evt.target.result;
      img.onload = () => {
        setBgImage(img);
        // After setting new background, ensure pan stays within bounds
        setPan((prev) => clampPan(prev.x, prev.y, scale));
      };
    };
    reader.readAsDataURL(file);
  };

  /* ------------------------------------------------------------------------ */
  /*                           Radial Context Menu                            */
  /* ------------------------------------------------------------------------ */

  /** Build slice descriptors for colours + tools */
  const colourSliceDeg = 180 / COLOUR_POOL.length;
  const toolSliceDeg = 180 / TOOL_LIST.length;

  const slices = [
    /* Left half: colours */
    ...COLOUR_POOL.map((clr, idx) => ({
      kind: 'colour',
      value: clr,
      start: 180 + idx * colourSliceDeg,
      end: 180 + (idx + 1) * colourSliceDeg,
    })),

    /* Right half: tools */
    ...TOOL_LIST.map((tl, idx) => ({
      kind: 'tool',
      value: tl,
      start: idx * toolSliceDeg,
      end: (idx + 1) * toolSliceDeg,
    })),
  ] as const;

  /** Commit selection & close menu */
  const commitSlice = (id: string) => {
    if (!id) return; // no hovered slice

    const [kind, val] = id.split(':');
    if (kind === 'colour') setUserColour(val);
    if (kind === 'tool') setCurrentTool(val as ToolType);

    setHoverId('');
    setMenuOpen(false);
  };

  /** Radial menu JSX (renders only when menuOpen) */
  const radialMenu =
    menuOpen && (
      <div
        className="fixed z-50"
        style={{ left: menuPos.x - 120, top: menuPos.y - 120 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg
          width="240"
          height="240"
          viewBox="-120 -120 240 240"
          onMouseLeave={() => commitSlice(hoverId)}
        >
          {slices.map((s, i) => {
            const id = `${s.kind}:${s.value}`;
            const labelPos = midPoint(110, s.start, s.end);
            return (
              <g
                key={i}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverId(id)}
                onClick={(e) => {
                  e.stopPropagation();
                  commitSlice(id);
                }}
              >
                <path
                  d={arcPath(110, s.start, s.end)}
                  fill={s.kind === 'colour' ? (s.value as string) : '#3b82f6'}
                  opacity={hoverId === id ? 0.93 : 0.77}
                  stroke="#374151"
                  strokeWidth="1"
                />

                {/* Tool label */}
                {s.kind === 'tool' && (
                  <text
                    x={labelPos.x}
                    y={labelPos.y + 4}
                    fontSize="12"
                    fill="#fff"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none', fontFamily: 'sans-serif' }}
                  >
                    {s.value}
                  </text>
                )}
              </g>
            );
          })}

          {/* Center close button */}
          <circle
            r="30"
            fill="#b91c1c"
            stroke="#fff"
            strokeWidth="2"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
            }}
          />
          <text y="6" textAnchor="middle" fontSize="26" fill="#ffffff">
            ×
          </text>
        </svg>
      </div>
    );

  /* ------------------------------------------------------------------------ */
  /*                               Thickness UI                               */
  /* ------------------------------------------------------------------------ */

  const thicknessSlider = (
    <div>
      <label className="font-bold text-sm">Thickness:</label>
      <div className="relative mt-1">
        <input
          type="range"
          className="w-full"
          min={1}
          max={20}
          value={lineWidth}
          onChange={(e) => setLineWidth(+e.target.value)}
        />

        {/* Tick marks for number‑key presets */}
        <div
          className="absolute left-0 top-1/2 w-full flex justify-between pointer-events-none"
          style={{ transform: 'translateY(-50%)' }}
        >
          {Object.keys(THICK_PRESETS).map((key) => (
            <div key={key} className="flex flex-col items-center">
              <div className="w-px h-3 bg-gray-400" />
              <span className="text-xxs text-gray-400">{key}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400">Press 1‑4 for quick selection</p>
    </div>
  );

  /* ------------------------------------------------------------------------ */
  /*                            Settings Panel JSX                             */
  /* ------------------------------------------------------------------------ */

  const panelCss = 'bg-gray-800 border border-gray-700 text-gray-100 p-3 rounded shadow-lg';

  const settingsPanel = panelOpen ? (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={panelCss}
      style={{ width: '340px' }}
    >
      <div className="flex flex-col gap-2">
        {/* Name */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold">Name:</label>
          <input
            className="bg-gray-700 border border-gray-600 rounded p-1 text-sm w-full"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
        </div>

        {/* Colour palette */}
        <div>
          <label className="text-sm font-bold">Colour:</label>
          <div className="grid grid-cols-8 gap-1 mt-1">
            {COLOUR_POOL.map((clr) => (
              <div
                key={clr}
                className="w-6 h-6 rounded-full border cursor-pointer"
                style={{ backgroundColor: clr, opacity: clr === userColour ? 1 : 0.6 }}
                onClick={() => setUserColour(clr)}
              />
            ))}
          </div>
        </div>

        {/* Tool selector */}
        <div className="flex items-center gap-2">
          <label className="font-bold text-sm">Tool:</label>
          <select
            className="bg-gray-700 border border-gray-600 rounded p-1 text-sm w-full"
            value={currentTool}
            onChange={(e) => setCurrentTool(e.target.value as ToolType)}
          >
            {TOOL_LIST.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Thickness */}
        {thicknessSlider}

        {/* Fade selection */}
        <div className="flex items-center gap-2">
          <label className="font-bold text-sm">Fade:</label>
          <select
            className="bg-gray-700 border border-gray-600 rounded p-1 text-sm w-full"
            value={fadeSetting}
            onChange={(e) => setFadeSetting(e.target.value)}
          >
            {FADE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Emoji selector */}
        {currentTool === 'emoji' && (
          <div className="flex items-center gap-2">
            <label className="font-bold text-sm">Emoji:</label>
            <select
              className="bg-gray-700 border border-gray-600 rounded p-1 text-sm w-full"
              value={selectedEmoji}
              onChange={(e) => setSelectedEmoji(e.target.value)}
            >
              {EMOJIS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Background upload */}
        <div>
          <label className="font-bold text-sm">Background:</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={bgLocked}
            className="bg-gray-700 border border-gray-600 rounded p-1 text-sm w-full mt-1"
          />
        </div>

        {/* Background lock toggle */}
        <div className="flex items-center gap-2">
          <label className="font-bold text-sm">Lock BG:</label>
          <input type="checkbox" checked={bgLocked} onChange={(e) => setBgLocked(e.target.checked)} />
        </div>

        {/* Panel buttons */}
        <div className="flex gap-2">
          <button
            className="bg-gray-700 border border-gray-600 px-2 py-1 rounded text-sm"
            onClick={() => setDevOpen((o) => !o)}
          >
            Dev
          </button>
          <button
            className="bg-gray-700 border border-gray-600 px-2 py-1 rounded text-sm"
            onClick={() => setPanelOpen(false)}
          >
            Close
          </button>
        </div>
      </div>
    </motion.div>
  ) : (
    <button
      className="p-2 bg-gray-800 border border-gray-700 text-gray-100 rounded"
      onClick={() => setPanelOpen(true)}
    >
      Menu
    </button>
  );

  /* ------------------------------------------------------------------------ */
  /*                             Component JSX                                */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="w-full h-screen bg-gray-900 select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* Main canvas container */}
      <div
        ref={canvasContainerRef}
        className="relative w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas className="absolute top-0 left-0" />
        {radialMenu}
      </div>

      {/* Zoom buttons */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-2 z-10">
        <button className="bg-gray-700 text-gray-100 px-2 py-1 rounded" onClick={() => zoomByFactor(1.1)}>
          +
        </button>
        <button className="bg-gray-700 text-gray-100 px-2 py-1 rounded" onClick={() => zoomByFactor(1 / 1.1)}>
          –
        </button>
      </div>

      {/* Settings panel */}
      <div className="absolute top-0 left-0 m-2 z-10">{settingsPanel}</div>

      {/* Connected users list */}
      <motion.div
        className="absolute top-2 right-2 bg-gray-800 border border-gray-700 text-gray-100 p-3 rounded shadow-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <h3 className="text-sm font-bold border-b border-gray-600 mb-1 pb-1">Users</h3>
        {userList.map((u) => (
          <div key={u.userId} className="flex items-center gap-1 text-xs">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: u.color }} />
            {u.userName}
          </div>
        ))}
      </motion.div>

      {/* Dev console */}
      {devOpen && (
        <motion.div
          className="absolute bottom-0 left-0 w-full max-h-56 bg-gray-900 text-gray-100 border-t border-gray-700 p-2 overflow-y-auto text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <pre>{JSON.stringify(actions, null, 2)}</pre>
        </motion.div>
      )}
    </div>
  );

  /* ---------------------------------------------------------------------- */
  /*                             Draw Helpers                               */
  /* ---------------------------------------------------------------------- */

  /** Draws an arrow (shaft + filled triangular head) */
  function drawArrow(ctx: CanvasRenderingContext2D, action: DrawAction) {
    const {
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      lineWidth: lw,
    } = action;

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = lw * 3;

    /* Shaft */
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - headLength * Math.cos(angle), y2 - headLength * Math.sin(angle));
    ctx.stroke();

    /* Arrowhead */
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle - 0.5),
      y2 - headLength * Math.sin(angle - 0.5),
    );
    ctx.lineTo(
      x2 - headLength * Math.cos(angle + 0.5),
      y2 - headLength * Math.sin(angle + 0.5),
    );
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  /** Draws a circle defined by drag radius */
  function drawCircle(ctx: CanvasRenderingContext2D, action: DrawAction) {
    const radius = Math.hypot(action.end.x - action.start.x, action.end.y - action.start.y);
    ctx.beginPath();
    ctx.arc(action.start.x, action.start.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
};

export default RealTimeMapApp;

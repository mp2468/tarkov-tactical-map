import React, {
  useRef,
  useState,
  useEffect,
  WheelEvent,
  MouseEvent,
  ChangeEvent,
} from 'react';
import { motion } from 'framer-motion';

////////////////////////////////////////////////////////////
// Updated TypeScript code that clamps panning so the background
// won't go fully out of view. The logic ensures the user can't
// drag the map fully off screen. We do a clampPan(...) function
// that references the background image dimensions (if loaded)
// and the canvas size to keep the map in view.
////////////////////////////////////////////////////////////

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
  expireAt?: number | Infinity
}

interface User {
  userId: string;
  userName: string;
  color: string;
}

const DISTINCT_COLORS: string[] = [
  '#ff0000', // red
  '#00ff00', // green
  '#0000ff', // blue
  '#ffff00', // yellow
  '#ff00ff', // magenta
  '#00ffff', // cyan
  '#ffa500', // orange
  '#800080', // purple
  '#008000', // dark green
  '#000000', // black
  '#808080', // gray
];

function getRandomName(): string {
  const animals = [
    'Lion', 'Tiger', 'Bear', 'Falcon', 'Eagle', 'Shark', 'Panda', 'Zebra', 'Wolf', 'Fox',
    'Dolphin', 'Koala', 'Sloth', 'Hawk', 'Crow', 'Otter', 'Rhino', 'Hippo', 'Moose', 'Parrot',
  ];
  const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
  return `Guest${randomAnimal}`;
}

const TOOL_TYPES: { [key: string]: ToolType } = {
  PEN: 'pen',
  ARROW: 'arrow',
  CIRCLE: 'circle',
  EMOJI: 'emoji',
};

const EMOJIS: string[] = ['😀', '🤩', '🔥', '🚀', '❤️', '👍', '🌟', '🎉', '😂', '🤔', '❓', '💡'];

const FADE_OPTIONS = [
  { label: '10 seconds', value: '10s' },
  { label: '30 seconds', value: '30s' },
  { label: '1 minute', value: '1m' },
  { label: '5 minutes', value: '5m' },
  { label: '10 minutes', value: '10m' },
  { label: 'Permanent', value: 'permanent' },
];

function parseFadeTime(value: string): number {
  switch (value) {
    case '10s': return 10000;
    case '30s': return 30000;
    case '1m': return 60000;
    case '5m': return 300000;
    case '10m': return 600000;
    default: return Infinity;
  }
}

const CollaborativeDrawingTool: React.FC = () => {
  ////////////////////////////////////
  // State
  ////////////////////////////////////
  const [userId] = useState<string>(() => 'user-' + Math.floor(Math.random() * 1000000));
  const [userName, setUserName] = useState<string>(getRandomName);
  const [userColor, setUserColor] = useState<string>('#ff0000');
  const [users, setUsers] = useState<User[]>([{ userId, userName, color: userColor }]);

  const [activeTool, setActiveTool] = useState<ToolType>('arrow');
  const [selectedEmoji, setSelectedEmoji] = useState<string>(EMOJIS[0]);
  const [lineWidth, setLineWidth] = useState<number>(10);
  const [fadeSetting, setFadeSetting] = useState<string>('permanent');
  const [drawActions, setDrawActions] = useState<DrawAction[]>([]);

  // For drawing
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // UI toggles
  const [devConsoleOpen, setDevConsoleOpen] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(true);

  // Background
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [backgroundLocked, setBackgroundLocked] = useState<boolean>(false);

  // Pan & zoom in "world space"
  const [scale, setScale] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  // For panning with Ctrl + left click
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Canvas ref
  const containerRef = useRef<HTMLDivElement>(null);

  ////////////////////////////////////
  // Color reservation logic
  ////////////////////////////////////
  useEffect(() => {
    if (!userColor) return;
    const currentUser: User = { userId, userName, color: userColor };
    setUsers((prev) => {
      const existingIndex = prev.findIndex((u) => u.userId === userId);
      if (existingIndex >= 0) {
        const clone = [...prev];
        clone[existingIndex] = { ...clone[existingIndex], color: userColor, userName };
        return clone;
      } else {
        return [...prev, currentUser];
      }
    });
  }, [userColor, userId, userName]);

  // Update name
  useEffect(() => {
    setUsers((prev) => {
      return prev.map((u) => {
        if (u.userId === userId) {
          return { ...u, userName };
        }
        return u;
      });
    });
  }, [userName, userId]);

  const usedColors = users.map((u) => u.color);
  const colorOptions = DISTINCT_COLORS.map((c) => {
    const isTaken = usedColors.includes(c) && c !== userColor;
    return { color: c, isTaken };
  });

  ////////////////////////////////////
  // Fade mechanism
  ////////////////////////////////////
  useEffect(() => {
    const interval = setInterval(() => {
      setDrawActions((prev) => {
        const now = Date.now();
        return prev.filter((action) => {
          if (!action.expireAt || action.expireAt === Infinity) {
            return true;
          }
          return now < action.expireAt;
        });
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  ////////////////////////////////////
  // Render canvas with pan/zoom in code
  ////////////////////////////////////
  useEffect(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Translate by -panX, -panY, then scale.
    // ctx.translate(-panX, -panY);
    // ctx.scale(scale, scale);

    // Draw background
    if (backgroundImage) {
      // ctx.drawImage(backgroundImage, 0, 0);

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // ...
      ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    }



    // Draw each action
    drawActions.forEach((action) => {
      switch (action.tool) {
        case 'pen':
          drawPenStroke(ctx, action);
          break;
        case 'arrow':
          drawArrow(ctx, action);
          break;
        case 'circle':
          drawCircle(ctx, action);
          break;
        case 'emoji':
          drawEmoji(ctx, action);
          break;
      }
    });

    ctx.restore();
  }, [drawActions, backgroundImage, panX, panY, scale]);

  ////////////////////////////////////
  // Convert screen -> world coords
  ////////////////////////////////////
  function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    if (!containerRef.current) {
      return { x: screenX, y: screenY };
    }

    const canvas = containerRef.current.querySelector('canvas');
    if (!canvas) {
      return { x: screenX, y: screenY };
    }

    const rect = canvas.getBoundingClientRect();
    const localX = screenX - rect.left;
    const localY = screenY - rect.top;

    // worldX = localX / scale + panX

    const worldX = localX / scale + panX;
    const worldY = localY / scale + panY;
    return { x: worldX, y: worldY };
  }

  ////////////////////////////////////
  // Helper to clamp pan so background won't fully leave screen
  ////////////////////////////////////
  function clampPan(px: number, py: number, sc: number): { x: number; y: number } {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) {
      return { x: px, y: py };
    }
    // The screen/canvas size
    const cw = canvas.width;
    const ch = canvas.height;

    // If we have a background, let's clamp so that background can't fully leave screen.
    // We'll let the bounding box be the background size or a minimal region.

    // If no background, we could skip clamp or clamp to 0.
    if (!backgroundImage) {
      // Maybe clamp so we can't move negative if there's no background?
      // We'll just do a minimal clamp: not letting the map go beyond 0,0.
      // But let's just skip for no background, returning px, py.
      return { x: px, y: py };
    }

    const bgw = backgroundImage.width;
    const bgh = backgroundImage.height;

    // after we apply translate(-px, -py), scale(sc), the background is drawn from (0,0)->(bgw,bgh) in world coords.
    // the screen is cw x ch.

    // We want at least part of the background to remain visible. We'll allow partial edges.

    // The top-left corner of the background in screen coords is ( -px*sc, -py*sc ).
    // The bottom-right corner of the background in screen coords is ( -px*sc + bgw*sc, -py*sc + bgh*sc ).

    // We can ensure that the background's corners cannot exceed the screen dimension too far.

    // We'll define constraints:
    // background's right edge => -px*sc + bgw*sc >= someMin e.g. 30 px?
    // background's left edge => -px*sc <= someMax?

    // For simplicity, let's require background to fill screen so we can't see emptiness.

    // That means:
    // left edge >= (cw) if we want to keep it in view => that doesn't make sense. Let's do a simpler approach:

    // We want the background not to drift off so that the screen is empty. We'll do:
    // left edge in screen coords: -px*sc
    // top edge in screen coords: -py*sc
    // right edge in screen coords: -px*sc + bgw*sc
    // bottom edge in screen coords: -py*sc + bgh*sc

    // we want left edge <= 0, top edge <= 0, right edge >= cw, bottom edge >= ch.

    // so:
    // -px*sc <= 0  => px >= 0
    // -py*sc <= 0  => py >= 0
    // (-px*sc + bgw*sc) >= cw => -px*sc >= cw - bgw*sc => px <= bgw - cw/sc ??? carefully.

    // let's define a local function:

    let minPanX = 0;
    let maxPanX = 0;
    let minPanY = 0;
    let maxPanY = 0;

    // left edge => -px*sc <= 0 => px >= 0
    minPanX = 0;

    // top edge => -py*sc <= 0 => py >= 0
    minPanY = 0;

    // right edge => -px*sc + bgw*sc >= cw => -px*sc >= cw - bgw*sc => px <= bgw - cw/sc??
    // but careful: cw is not scaled.

    // rewriting: -px*sc + bgw*sc >= cw => bgw*sc - px*sc >= cw => sc*(bgw - px) >= cw => (bgw - px) >= cw/sc => px <= bgw - cw/sc

    maxPanX = bgw - cw / sc;
    if (maxPanX < 0) {
      // if the background is smaller than the screen, we can center it or keep px=0.
      maxPanX = 0;
    }

    // bottom edge => -py*sc + bgh*sc >= ch => -py*sc >= ch - bgh*sc => py <= bgh - ch/sc

    maxPanY = bgh - ch / sc;
    if (maxPanY < 0) {
      maxPanY = 0;
    }

    // now we clamp px, py
    let clampedX = px;
    let clampedY = py;
    if (clampedX < minPanX) clampedX = minPanX;
    if (clampedX > maxPanX) clampedX = maxPanX;
    if (clampedY < minPanY) clampedY = minPanY;
    if (clampedY > maxPanY) clampedY = maxPanY;

    return { x: clampedX, y: clampedY };
  }

  ////////////////////////////////////
  // Panning logic (CTRL + LMB)
  ////////////////////////////////////
  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return;

    if (e.ctrlKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Start drawing.
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    setStartPoint({ x, y });
    setIsDrawing(true);
  }

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;

      const nx = panX - dx / scale;
      const ny = panY - dy / scale;

      setPanStart({ x: e.clientX, y: e.clientY });

      // clamp
      const clamped = clampPan(nx, ny, scale);
      setPanX(clamped.x);
      setPanY(clamped.y);
      return;
    }

    // if drawing
    if (!isDrawing) return;
    if (activeTool === 'pen') {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const fadeMs = parseFadeTime(fadeSetting);
      const expireAt = fadeMs === Infinity ? Infinity : Date.now() + fadeMs;
      const newAction: DrawAction = {
        userId,
        userName,
        color: userColor,
        tool: 'pen',
        lineWidth,
        start: { x: startPoint.x, y: startPoint.y },
        end: { x, y },
        expireAt,
      };
      setDrawActions((prev) => [...prev, newAction]);
      setStartPoint({ x, y });
    }
  }

  function handleMouseUp(e: MouseEvent<HTMLDivElement>) {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isDrawing) return;

    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const fadeMs = parseFadeTime(fadeSetting);
    const expireAt = fadeMs === Infinity ? Infinity : Date.now() + fadeMs;

    if (activeTool === 'arrow' || activeTool === 'circle' || activeTool === 'emoji') {
      const newAction: DrawAction = {
        userId,
        userName,
        color: userColor,
        tool: activeTool,
        lineWidth,
        start: { x: startPoint.x, y: startPoint.y },
        end: { x, y },
        emoji: selectedEmoji,
        expireAt,
      };
      setDrawActions((prev) => [...prev, newAction]);
    }

    setIsDrawing(false);
  }

  ////////////////////////////////////
  // Undo with Backspace
  ////////////////////////////////////
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Undo if Backspace
      if (e.key === 'Backspace') {
        setDrawActions((prev) => prev.slice(0, -1));
        e.preventDefault();
        return;
      }

      // Undo if Ctrl+Z or Cmd+Z
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
        setDrawActions((prev) => prev.slice(0, -1));
        e.preventDefault();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setDrawActions]);

  ////////////////////////////////////
  // Background / lock
  ////////////////////////////////////
  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    if (backgroundLocked) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Currently only images are supported as a background.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      if (typeof evt.target?.result === 'string') {
        img.src = evt.target.result;
      }
      img.onload = () => {
        setBackgroundImage(img);
        // after setting background, also clamp the pan so we stay in view.
        const clamped = clampPan(panX, panY, scale);
        setPanX(clamped.x);
        setPanY(clamped.y);
      };
    };
    reader.readAsDataURL(file);
  }

  ////////////////////////////////////
  // Zoom logic
  ////////////////////////////////////

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();

    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const mouseX = e.clientX - rect.left; // local coords
    const mouseY = e.clientY - rect.top;

    let newScale = scale;
    if (e.deltaY < 0) {
      // zoom in
      newScale *= 1.1;
      if (newScale > 4) newScale = 4;
    } else {
      // zoom out but not below 1
      newScale /= 1.1;
      if (newScale < 1) newScale = 1;
    }

    const worldXBefore = mouseX / scale + panX;
    const worldYBefore = mouseY / scale + panY;

    const worldXAfter = worldXBefore; // we want the same world coords after.
    const worldYAfter = worldYBefore;

    // so newPanX = worldXAfter - (mouseX / newScale)
    const newPanX = worldXAfter - mouseX / newScale;
    const newPanY = worldYAfter - mouseY / newScale;

    // clamp
    const clamped = clampPan(newPanX, newPanY, newScale);

    setScale(newScale);
    setPanX(clamped.x);
    setPanY(clamped.y);
  }

  function zoomIn() {
    let newScale = scale * 1.1;
    if (newScale > 4) newScale = 4;
    zoomAroundCenter(newScale);
  }

  function zoomOut() {
    let newScale = scale / 1.1;
    if (newScale < 1) newScale = 1;
    zoomAroundCenter(newScale);
  }

  function zoomAroundCenter(newScale: number) {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) {
      setScale(newScale);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const worldXBefore = centerX / scale + panX;
    const worldYBefore = centerY / scale + panY;

    const newPanX = worldXBefore - centerX / newScale;
    const newPanY = worldYBefore - centerY / newScale;

    const clamped = clampPan(newPanX, newPanY, newScale);

    setScale(newScale);
    setPanX(clamped.x);
    setPanY(clamped.y);
  }

  function resetZoom() {
    // we'll clamp pan to 0,0 in that scenario.
    setScale(1);
    setPanX(0);
    setPanY(0);
  }

  const isZoomed = scale !== 1 || panX !== 0 || panY !== 0;

  ////////////////////////////////////
  // Render
  ////////////////////////////////////

  const panelClasses = 'bg-gray-800 border border-gray-700 text-gray-100 p-3 rounded shadow-lg';

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* The main container that listens for wheel, mousedown, etc. */}
      <div
        ref={containerRef}
        className="relative w-full h-full"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <canvas
          width={window.innerWidth}
          height={window.innerHeight}
          className="absolute top-0 left-0"
        />
      </div>

      {/* Zoom Buttons at bottom-right */}
      <div className="absolute bottom-2 right-2 flex flex-col space-y-2 z-10">
        <button
          className="bg-gray-700 text-gray-100 border border-gray-600 px-2 py-1 rounded hover:bg-gray-600 text-sm"
          onClick={zoomIn}
        >
          +
        </button>
        <button
          className="bg-gray-700 text-gray-100 border border-gray-600 px-2 py-1 rounded hover:bg-gray-600 text-sm"
          onClick={zoomOut}
        >
          -
        </button>
      </div>

      {/* Top-right flex for Reset Zoom + User list */}
      <div className="absolute top-2 right-2 z-10 flex items-start gap-2">
        {isZoomed && (
          <motion.button
            className="bg-gray-700 text-gray-100 border border-gray-600 px-2 py-1 rounded hover:bg-gray-600 text-sm"
            onClick={resetZoom}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            Reset Zoom
          </motion.button>
        )}

        {/* User list panel */}
        <motion.div
          className={panelClasses}
          style={{ minWidth: '150px' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h3 className="font-bold mb-2 text-sm border-b border-gray-500 pb-1">
            Users Online
          </h3>
          <div className="flex flex-col space-y-1">
            {users.map((u) => (
              <div key={u.userId} className="flex items-center space-x-2 text-sm">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: u.color }}
                />
                <span className="font-semibold">{u.userName}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Top menu (collapsible) */}
      {menuOpen && (
        <motion.div
          className="absolute top-0 left-0 m-2 z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className={panelClasses} style={{ width: '320px' }}>
            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-2">
                <label className="font-bold text-sm">Your Name:</label>
                <input
                  className="bg-gray-700 text-gray-100 border border-gray-600 rounded p-1 text-sm w-full"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>

              {/* Distinct color list selection */}
              <div>
                <label className="font-bold text-sm">Your Color:</label>
                <div className="grid grid-cols-6 gap-1 mt-1">
                  {colorOptions.map(({ color, isTaken }) => (
                    <div
                      key={color}
                      className="w-6 h-6 rounded-full border border-gray-400"
                      style={{
                        backgroundColor: color,
                        opacity: isTaken && color !== userColor ? 0.4 : 1,
                        cursor: isTaken && color !== userColor ? 'not-allowed' : 'pointer',
                      }}
                      title={
                        isTaken && color !== userColor
                          ? 'This color is taken by someone else'
                          : color
                      }
                      onClick={() => {
                        if (!isTaken || color === userColor) {
                          setUserColor(color);
                        }
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs mt-1" style={{ color: '#ccc' }}>
                  Currently Selected: <span>{userColor}</span>
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <label className="font-bold text-sm">Tool:</label>
                <select
                  className="bg-gray-700 text-gray-100 border border-gray-600 rounded p-1 text-sm w-full"
                  value={activeTool}
                  onChange={(e) => setActiveTool(e.target.value as ToolType)}
                >
                  <option value="pen">Pen</option>
                  <option value="arrow">Arrow</option>
                  <option value="circle">Circle</option>
                  <option value="emoji">Emoji</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <label className="font-bold text-sm">Thickness:</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={lineWidth}
                  onChange={(e) => setLineWidth(parseInt(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm font-semibold">{lineWidth}px</span>
              </div>

              <div className="flex items-center space-x-2">
                <label className="font-bold text-sm">Fade After:</label>
                <select
                  className="bg-gray-700 text-gray-100 border border-gray-600 rounded p-1 text-sm w-full"
                  value={fadeSetting}
                  onChange={(e) => setFadeSetting(e.target.value)}
                >
                  {FADE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {activeTool === 'emoji' && (
                <div className="flex items-center space-x-2">
                  <label className="font-bold text-sm">Emoji:</label>
                  <select
                    className="bg-gray-700 text-gray-100 border border-gray-600 rounded p-1 text-sm w-full"
                    value={selectedEmoji}
                    onChange={(e) => setSelectedEmoji(e.target.value)}
                  >
                    {EMOJIS.map((emo) => (
                      <option key={emo} value={emo}>
                        {emo}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-bold text-sm mr-2">Background Upload:</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={backgroundLocked}
                  className="bg-gray-700 text-gray-100 border border-gray-600 rounded p-1 text-sm w-full"
                />
              </div>

              {/* Toggle lock background */}
              <div className="flex items-center space-x-2">
                <label className="font-bold text-sm">Lock Background:</label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backgroundLocked}
                    onChange={(e) => setBackgroundLocked(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 border border-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-gray-500 peer-checked:border-gray-400 transition-all"></div>
                </label>
              </div>

              <div className="flex space-x-2 mt-2">
                <button
                  onClick={() => setDevConsoleOpen(!devConsoleOpen)}
                  className="bg-gray-700 text-gray-100 border border-gray-600 px-2 py-1 rounded hover:bg-gray-600 text-sm"
                >
                  Toggle Dev Console
                </button>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="bg-gray-700 text-gray-100 border border-gray-600 px-2 py-1 rounded hover:bg-gray-600 text-sm"
                >
                  Close Menu
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {!menuOpen && (
        <button
          className="absolute top-0 left-0 m-2 p-2 z-10 text-sm bg-gray-800 border border-gray-700 text-gray-100 rounded hover:bg-gray-700"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      )}

      {devConsoleOpen && (
        <motion.div
          className="absolute bottom-0 left-0 w-full p-2 z-20 overflow-y-auto max-h-48 bg-gray-900 text-gray-100 border-t border-gray-700"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ fontSize: '0.75rem' }}
        >
          <h3 className="font-bold text-sm">Dev Console</h3>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(drawActions, null, 2)}
          </pre>
        </motion.div>
      )}
    </div>
  );

  ////////////////////////////////////
  // Draw Helpers
  ////////////////////////////////////

  function drawPenStroke(ctx: CanvasRenderingContext2D, action: DrawAction) {
    ctx.beginPath();
    ctx.strokeStyle = action.color;
    ctx.lineWidth = action.lineWidth;
    ctx.moveTo(action.start.x, action.start.y);
    ctx.lineTo(action.end.x, action.end.y);
    ctx.stroke();
  }

  function drawArrow(ctx: CanvasRenderingContext2D, action: DrawAction) {
    const { x: x1, y: y1 } = action.start;
    const { x: x2, y: y2 } = action.end;

    const lw = action.lineWidth;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const headLength = lw * 3;          // arrowhead size
    const lineEndDistance = lw * 1.5;   // how far back we pull the line

    // If the distance is extremely small, skip the line or adjust.
    if (dist < lineEndDistance) {
      // We'll place the arrow tip at (x2, y2), but the line won't draw.
      // Optionally: draw a small arrow or skip entirely.
      drawArrowHead(ctx, x2, y2, angle, lw, headLength);
      return;
    }

    // 1) Draw the shaft from (x1,y1) to the base so the arrowhead doesn't overlap
    const xBase = x2 - lineEndDistance * Math.cos(angle);
    const yBase = y2 - lineEndDistance * Math.sin(angle);

    ctx.beginPath();
    ctx.strokeStyle = action.color;
    ctx.lineWidth = lw;
    ctx.moveTo(x1, y1);
    ctx.lineTo(xBase, yBase);
    ctx.stroke();

    // 2) Arrowhead from the final tip
    drawArrowHead(ctx, x2, y2, angle, lw, headLength);
  }

  function drawArrowHead(
    ctx: CanvasRenderingContext2D,
    xTip: number,
    yTip: number,
    angle: number,
    lw: number,
    headLength: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(xTip, yTip);

    ctx.lineTo(
      xTip - headLength * Math.cos(angle - Math.PI / 6),
      yTip - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      xTip - headLength * Math.cos(angle + Math.PI / 6),
      yTip - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();

    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }



  function drawCircle(ctx: CanvasRenderingContext2D, action: DrawAction) {
    const { x: x1, y: y1 } = action.start;
    const { x: x2, y: y2 } = action.end;
    const radius = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    ctx.beginPath();
    ctx.strokeStyle = action.color;
    ctx.lineWidth = action.lineWidth;
    ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }

  function drawEmoji(ctx: CanvasRenderingContext2D, action: DrawAction) {
    const { x: x2, y: y2 } = action.end;
    ctx.font = '32px sans-serif';
    ctx.fillText(action.emoji || '😀', x2, y2);
  }
};

export default CollaborativeDrawingTool;

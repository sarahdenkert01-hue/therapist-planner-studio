import React, { useState, useRef, useEffect } from "react";
import { Stage, Layer, Rect, Group, Transformer, Image, Text } from "react-konva";
import useImage from "use-image";
import jsPDF from "jspdf";

const WIDTH = 1536; 
const HEIGHT = 2048; 
const VIEW_SCALE = 0.35; 

// --- 1. THE VAULT (License Key Logic) ---
const rawKeys = import.meta.env.VITE_LICENSE_KEYS || "";
const VALID_KEYS = rawKeys.split(",").map(k => k.trim().toUpperCase());

const GRID_CONFIG = { startX: 253, startY: 330, sqWidth: 168, sqHeight: 200 };
const TAB_CONFIG = { x: 1477, startY: 166, width: 59, height: 125 };

const MONTH_OFFSETS = {
  sunday: { JAN: 4, FEB: 0, MAR: 0, APR: 3, MAY: 5, JUN: 1, JUL: 3, AUG: 6, SEP: 2, OCT: 4, NOV: 0, DEC: 2 },
  monday: { JAN: 3, FEB: 6, MAR: 6, APR: 2, MAY: 4, JUN: 0, JUL: 2, AUG: 5, SEP: 1, OCT: 3, NOV: 6, DEC: 1 }
};

const ImageBlock = ({ block, isSelected, onSelect, onChange }) => {
  const [img, status] = useImage(block.src, "anonymous");
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current && status === 'loaded' && !block.locked) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, status, block.locked]);

  if (status === 'failed') return null;

  return (
    <React.Fragment>
      <Image
        image={img}
        id={block.id}
        x={block.x} y={block.y}
        width={block.width} height={block.height}
        draggable={!block.locked}
        ref={shapeRef}
        onClick={onSelect}
        onDragEnd={(e) => onChange({ ...block, x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1); node.scaleY(1);
          onChange({
            ...block,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
        opacity={block.locked ? 0.9 : 1}
      />
      {isSelected && status === 'loaded' && !block.locked && (
        <Transformer ref={trRef} keepRatio={true} />
      )}
    </React.Fragment>
  );
};

export default function PlannerCanvas() {
  // --- 2. GATEKEEPER STATE ---
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [licenseInput, setLicenseInput] = useState("");

  const [pages, setPages] = useState([{ id: "p1", name: "Planner Start", section: "JAN", type: "NONE", blocks: [], bg: "backgroundwithtabs.png" }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [startDay, setStartDay] = useState("sunday");
  const [exportProgress, setExportProgress] = useState(null);

  const stageRef = useRef();
  const currentPage = pages[currentPageIndex];
  const selectedBlock = currentPage.blocks.find(b => b.id === selectedId);
  const [bgImg, bgStatus] = useImage(`/${currentPage.bg}`, "anonymous");

  const checkLicense = () => {
    if (VALID_KEYS.includes(licenseInput.trim().toUpperCase())) {
      setIsUnlocked(true);
    } else {
      alert("Invalid License Key. Please check your Etsy order for the correct code!");
    }
  };

  const changeBackground = (bgFileName, applyToAll = false) => {
    setPages(prev => prev.map((p, idx) => {
      if (applyToAll || idx === currentPageIndex) {
        return { ...p, bg: bgFileName };
      }
      return p;
    }));
  };

  const addBlock = (fileName) => {
    const id = Date.now().toString() + Math.random();
    let width = 600; let height = 600;
    let x = 400; let y = 400;

    if (fileName.includes('header')) {
        if (fileName.includes('start')) { width = 1167; height = 100; x = 253; y = 220; } 
        else { width = 450; height = 100; x = 540; y = 100; }
    }

    const newBlock = { id, src: `/${fileName}`, x, y, width, height, locked: false };
    setPages(prev => {
      const n = [...prev];
      n[currentPageIndex].blocks.push(newBlock);
      return n;
    });
    setSelectedId(id);
  };

  const applyStarter = (fileName) => {
    if (!window.confirm("This will clear the current page and apply the template. Continue?")) return;
    const id = Date.now().toString() + Math.random();
    const starterBlock = { id, src: `/${fileName}`, x: 253, y: 150, width: 1167, height: 1800, locked: true };
    setPages(prev => {
      const n = [...prev];
      n[currentPageIndex].blocks = [starterBlock];
      return n;
    });
    setSelectedId(id);
  };

  const duplicatePage = () => {
      const newPage = JSON.parse(JSON.stringify(currentPage));
      newPage.id = Date.now().toString() + Math.random();
      newPage.name = currentPage.name + " (Copy)";
      setPages(prev => [...prev, newPage]);
      setCurrentPageIndex(pages.length); 
  };

  const addBlankPage = () => {
    const newPage = { 
      id: Date.now().toString() + Math.random(), 
      name: "New Page", 
      section: "NONE", 
      type: "NONE", 
      blocks: [], 
      bg: "backgroundwithtabs.png" 
    };
    setPages(prev => [...prev, newPage]);
    setCurrentPageIndex(pages.length);
  };

  function deleteBlock() {
    if (!selectedId) return;
    setPages(prev => {
      const n = [...prev];
      n[currentPageIndex].blocks = n[currentPageIndex].blocks.filter(b => b.id !== selectedId);
      return n;
    });
    setSelectedId(null);
  }

  const clearPage = () => {
    if (!window.confirm("Clear all unlocked items?")) return;
    setPages(prev => {
        const n = [...prev];
        n[currentPageIndex].blocks = n[currentPageIndex].blocks.filter(b => b.locked);
        return n;
    });
  };

  const toggleLock = () => {
    if (!selectedId) return;
    setPages(prev => {
        const n = [...prev];
        n[currentPageIndex].blocks = n[currentPageIndex].blocks.map(b => b.id === selectedId ? { ...b, locked: !b.locked } : b);
        return n;
    });
  };

  const addMonthBundle = (month) => {
    const currentBg = pages[currentPageIndex].bg;
    const bundle = [];
    const timestamp = Date.now();
    const svgFileName = `${month.toLowerCase()}${startDay}start.svg`;

    bundle.push({ 
      id: `m-${month}-${timestamp}`, 
      name: `${month} Overview`, section: month, type: "MONTH", bg: currentBg, 
      blocks: [
          { id: `cal-${timestamp}`, src: `/${svgFileName}`, x: GRID_CONFIG.startX, y: GRID_CONFIG.startY, width: 1167, height: 1000, locked: true },
          { id: `head-${timestamp}`, src: `/${month.toLowerCase()}header.svg`, x: 540, y: 100, width: 450, height: 100, locked: false }
      ] 
    });

    for (let w = 1; w <= 5; w++) bundle.push({ id: `w-${month}-${w}-${timestamp}`, name: `${month} Wk ${w}`, section: month, type: "WEEK", blocks: [], bg: currentBg });
    for (let d = 1; d <= 31; d++) bundle.push({ id: `d-${month}-${d}-${timestamp}`, name: `${month} Day ${d}`, section: month, type: "DAY", blocks: [], bg: currentBg });
    
    setPages(prev => [...prev, ...bundle]);
  };

  const exportSmartPDF = async () => {
    setSelectedId(null);
    const pdf = new jsPDF("p", "pt", [WIDTH, HEIGHT]);
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    for (let i = 0; i < pages.length; i++) {
      setExportProgress(Math.round(((i + 1) / pages.length) * 100));
      setCurrentPageIndex(i);
      await new Promise(r => setTimeout(r, 450)); 
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 1.5, mimeType: "image/jpeg", quality: 0.85 });
      if (i > 0) pdf.addPage([WIDTH, HEIGHT], "p");
      pdf.addImage(dataUrl, "JPEG", 0, 0, WIDTH, HEIGHT, undefined, 'FAST');
      
      months.forEach((m, idx) => {
        const tIdx = pages.findIndex(pg => pg.section === m && pg.type === "MONTH");
        if (tIdx !== -1) pdf.link(TAB_CONFIG.x, TAB_CONFIG.startY + (idx * TAB_CONFIG.height), TAB_CONFIG.width, TAB_CONFIG.height, { pageNumber: tIdx + 1 });
      });

      if (pages[i].type === "MONTH") {
        const mName = pages[i].section;
        const offset = MONTH_OFFSETS[startDay][mName];
        const firstDayIdx = pages.findIndex(pg => pg.section === mName && pg.type === "DAY");
        if (firstDayIdx !== -1) {
          for (let d = 0; d < 31; d++) {
            const slot = d + offset;
            pdf.link(GRID_CONFIG.startX + ((slot % 7) * GRID_CONFIG.sqWidth), GRID_CONFIG.startY + (Math.floor(slot / 7) * GRID_CONFIG.sqHeight), GRID_CONFIG.sqWidth, GRID_CONFIG.sqHeight, { pageNumber: firstDayIdx + d + 1 });
          }
        }
      }
    }
    setExportProgress(null);
    pdf.save("Therapist_Planner_2026.pdf");
  };

  // --- 3. THE LOCK SCREEN RENDER ---
  if (!isUnlocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f0f2f5', fontFamily: 'sans-serif' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '15px', boxShadow: '0 8px 30px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px' }}>
          <h1 style={{ color: '#4f46e5', marginBottom: '10px' }}>Therapist Planner Studio</h1>
          <p style={{ color: '#666', marginBottom: '25px' }}>Enter your Etsy license key to unlock your professional planner designer.</p>
          <input 
            type="text" 
            placeholder="Enter Key Here..." 
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '2px solid #ddd', fontSize: '16px', boxSizing: 'border-box' }}
          />
          <button 
            onClick={checkLicense}
            style={{ width: '100%', padding: '12px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}
          >
            Unlock Access
          </button>
        </div>
      </div>
    );
  }

  // --- 4. THE ACTUAL PLANNER RENDER (Only visible if isUnlocked is true) ---
  return (
    <div style={{ display: "flex", height: "100vh", background: "#f0f2f5", overflow: "hidden" }}>
      {exportProgress !== null && (
        <div style={overlayStyle}>
          <div style={progressCard}>
            <h3>Generating PDF...</h3>
            <div style={progressBarBg}><div style={progressBarFill(exportProgress)} /></div>
            <p>{exportProgress}% Complete</p>
          </div>
        </div>
      )}

      <div style={{ width: "320px", background: "white", padding: "20px", overflowY: "auto", borderRight: "1px solid #ddd" }}>
        <h2 style={{fontSize: '20px', fontWeight: 'bold', marginBottom: '10px'}}>Designer</h2>
        
        {selectedId && (
            <div style={{ marginBottom: '20px', padding: '10px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee' }}>
                <button onClick={toggleLock} style={{...actionBtn, background: selectedBlock?.locked ? '#ffd33d' : '#fff'}}>
                    {selectedBlock?.locked ? "🔓 Unlock" : "🔒 Lock"}
                </button>
                <button onClick={deleteBlock} style={{...actionBtn, background: '#fff', color: '#ff4d4f', borderColor: '#ffa39e', marginTop: '5px'}}>
                    🗑️ Delete Block
                </button>
            </div>
        )}

        {/* --- BACKGROUND SECTION --- */}
        <SectionTitle> Page Backgrounds</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px", marginBottom: "10px" }}>
            <button onClick={() => changeBackground('backgroundwithtabs.png')} style={smallBtn}>Standard</button>
            <button onClick={() => changeBackground('glitter.png')} style={smallBtn}>Glitter</button>
            <button onClick={() => changeBackground('mermaid.png')} style={smallBtn}>Mermaid</button>
            <button onClick={() => changeBackground('neutral.png')} style={smallBtn}>Neutral</button>
            <button onClick={() => changeBackground('rainbow.png')} style={smallBtn}>Rainbow</button>
            <button onClick={() => changeBackground('marble.png')} style={smallBtn}>Marble</button>
            <button onClick={() => changeBackground('cheetah.png')} style={smallBtn}>Cheetah</button>
            <button onClick={() => changeBackground('gingham.png')} style={smallBtn}>Gingham</button>
        </div>
        <button onClick={() => changeBackground(currentPage.bg, true)} style={{...smallBtn, width:'100%', background:'#e1f5fe', color:'#01579b'}}>Apply current to ALL pages</button>

        <SectionTitle> Planner Cover</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <LibraryBtn onClick={() => addBlock("standardcover.png")}>Standard</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("glittercover.png")}>Glitter</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("mermaidcover.png")}>Mermaid</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("neutralcover.png")}>Neutral</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("rainbowcover.png")}>Rainbow</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("marblecover.png")}>Marble</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("cheetahcover.png")}>Cheetah</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("ginghamcover.png")}>Gingham</LibraryBtn>
        </div>

        <SectionTitle> Starter Layouts</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <LibraryBtn onClick={() => applyStarter('annualplannertemplate.svg')}>Annual Planner</LibraryBtn>
            <LibraryBtn onClick={() => applyStarter('dailyscheduletemplate.svg')}>Daily Schedule</LibraryBtn>
            <LibraryBtn onClick={() => applyStarter('taskplannertemplate.svg')}>Task Planner</LibraryBtn>
            <LibraryBtn onClick={() => applyStarter('taskplantemplate.svg')}>To-Do Planner</LibraryBtn>
            <LibraryBtn onClick={() => applyStarter('weeklyplantemplate.svg')}>Weekly Planner</LibraryBtn>
            <LibraryBtn onClick={() => applyStarter('weekscheduletemplate.svg')}>Weekly Session Schedule</LibraryBtn>
            <LibraryBtn onClick={() => applyStarter('weektodotemplate.svg')}>Weekly To-Do</LibraryBtn>
            <LibraryBtn onClick={() => applyStarter('yearoverviewtemplate.svg')}>Yearly Overview</LibraryBtn>
            <LibraryBtn onClick={() => applyStarter('yearpixelstemplate.svg')}>Year in Pixels</LibraryBtn>
        </div>

        <SectionTitle> Month Bundles</SectionTitle>
        <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
          <button onClick={() => setStartDay("sunday")} style={toggleBtn(startDay === "sunday")}>Sun</button>
          <button onClick={() => setStartDay("monday")} style={toggleBtn(startDay === "monday")}>Mon</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
          {["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].map(m => (
            <button key={m} onClick={() => addMonthBundle(m)} style={bundleBtn}>{m}</button>
          ))}
        </div>

        <SectionTitle> Headers</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <LibraryBtn onClick={() => addBlock("sunstartheader.svg")}>Sun Week Strip</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("monstartheader.svg")}>Mon Week Strip</LibraryBtn>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2px", marginTop:'5px' }}>
                {["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].map(m => (
                    <button key={m} onClick={() => addBlock(`${m}header.svg`)} style={{fontSize:'8px', padding:'4px'}}>{m.toUpperCase()}</button>
                ))}
            </div>
        </div>

        <SectionTitle> Clinical Templates</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <LibraryBtn onClick={() => addBlock("ThoughtLog.svg")}>Thought Log</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("InsuranceTracker.svg")}>Insurance Tracker</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("BillingTracker.svg")}>Billing Tracker</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("CEUTracker.svg")}>CEU Tracker</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("DailySessions.svg")}>Daily Sessions</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("GoalPlanner.svg")}>Goal Planner</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("WeeklySchedule.svg")}>Weekly Schedule</LibraryBtn>
        </div>

        <SectionTitle> Note Templates</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <LibraryBtn onClick={() => addBlock("BulletNotes.svg")}>Bullet Notes</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("NoteLines.svg")}>Notebook Lines</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("CornellNotes.svg")}>Cornell Notes</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("TopicNotes.svg")}>Topic Notes</LibraryBtn>
          <LibraryBtn onClick={() => addBlock("sessionnotes.svg")}>Session Notes</LibraryBtn>
        </div>

        <SectionTitle> Trackers</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <LibraryBtn onClick={() => addBlock("HabitTracker.svg")}>Habit Tracker</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("MoodTracker.svg")}>Mood Tracker</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("WaterTracker.svg")}>Water Tracker</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("Tracker.svg")}>Basic Tracker</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("EnergyTracker.svg")}>Energy Tracker</LibraryBtn>
        </div>

        <SectionTitle> Other Templates</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <LibraryBtn onClick={() => addBlock("DailySchedule.svg")}>Daily Schedule</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("ToDoList.svg")}>To-Do List</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("Grid.svg")}>Grid Block</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("MonthlyCalendar.svg")}>Mini Month</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("MonthlyReview.svg")}>Monthly Review</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("Priorities.svg")}>Priorities</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("Reminder.svg")}>Reminder</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("WeeklyToDo.svg")}>Weekly To Do</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("WeeklyReview.svg")}>Weekly Review</LibraryBtn>
        </div>

        <SectionTitle> Page Management</SectionTitle>
        <div style={{display:'flex', gap:'5px', marginBottom:'5px'}}>
            <button onClick={addBlankPage} style={{flex:1, padding:'8px', fontSize:'11px', background:'#4f46e5', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}>➕ Add Page</button>
            <button onClick={duplicatePage} style={{flex:1, padding:'8px', fontSize:'11px', background:'#fff', border:'1px solid #ddd', cursor:'pointer'}}>👯 Duplicate</button>
            <button onClick={clearPage} style={{flex:1, padding:'8px', fontSize:'11px', background:'#fff', border:'1px solid #ddd', color: '#ff4d4f', cursor:'pointer'}}>🧹 Clear</button>
        </div>
        <div style={{ maxHeight: "150px", overflowY: "auto", border: '1px solid #eee' }}>
          {pages.map((p, idx) => (
            <button key={p.id} onClick={() => setCurrentPageIndex(idx)} style={pageBtn(currentPageIndex === idx)}>{idx + 1}. {p.name}</button>
          ))}
        </div>

        <button onClick={exportSmartPDF} style={exportBtn}>💾 EXPORT PDF</button>
      </div>

      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "20px", overflow: "auto" }}>
        <div style={{ width: WIDTH * VIEW_SCALE, height: HEIGHT * VIEW_SCALE, boxShadow: "0 10px 30px rgba(0,0,0,0.1)", background: "white", position: "relative" }}>
          <div style={{ transform: `scale(${VIEW_SCALE})`, transformOrigin: "top left", width: WIDTH, height: HEIGHT }}>
            <Stage width={WIDTH} height={HEIGHT} ref={stageRef}>
              <Layer>
                <Rect width={WIDTH} height={HEIGHT} fill="white" />
                {bgStatus === 'loaded' && <Image image={bgImg} width={WIDTH} height={HEIGHT} />}
                {currentPage.blocks.map((block) => (
                  <ImageBlock key={block.id} block={block} isSelected={block.id === selectedId} onSelect={() => setSelectedId(block.id)} onChange={(newAttrs) => {
                    setPages(prev => {
                      const n = [...prev];
                      n[currentPageIndex].blocks = n[currentPageIndex].blocks.map(b => b.id === block.id ? newAttrs : b);
                      return n;
                    });
                  }} />
                ))}
              </Layer>
            </Stage>
          </div>
        </div>
      </div>
    </div>
  );
}

// STYLES
const smallBtn = { padding: '5px', fontSize: '10px', cursor: 'pointer', background: '#fff', border: '1px solid #ddd', borderRadius: '4px' };
const overlayStyle = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" };
const progressCard = { background: "white", padding: "30px", borderRadius: "12px", textAlign: "center", width: "280px" };
const progressBarBg = { width: "100%", height: "8px", background: "#eee", borderRadius: "4px", marginTop: "15px", overflow: "hidden" };
const progressBarFill = (p) => ({ width: `${p}%`, height: "100%", background: "#4caf50" });
const SectionTitle = ({ children }) => <h4 style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", marginTop: "15px", marginBottom: "5px" }}>{children}</h4>;
const bundleBtn = { padding: "6px", fontSize: "10px", background: "#eef2ff", border: "1px solid #c7d2fe", cursor: "pointer", borderRadius: "4px" };
const actionBtn = { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', cursor: 'pointer', fontSize: '11px', fontWeight: '500' };
const toggleBtn = (active) => ({ flex: 1, padding: "8px", background: active ? "#4f46e5" : "#f1f3f5", color: active ? "white" : "#444", border: "none", cursor: "pointer" });
const pageBtn = (active) => ({ width: "100%", padding: "8px", textAlign: "left", background: active ? "#f8fafc" : "transparent", color: active ? "#4f46e5" : "#444", border: "none", borderLeft: active ? '4px solid #4f46e5' : '4px solid transparent', fontSize: "11px", cursor: "pointer" });
const LibraryBtn = ({ onClick, children }) => <button onClick={onClick} style={{ width: "100%", padding: "8px", background: "#fff", border: "1px solid #e2e8f0", textAlign: "left", cursor: "pointer", fontSize: "11px", borderRadius: "4px" }}>{children}</button>;
const exportBtn = { padding: "14px", background: "#4f46e5", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", width: "100%", cursor: "pointer", marginTop: '10px' };

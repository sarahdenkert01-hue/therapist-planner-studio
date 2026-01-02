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
      if (applyToAll || idx === currentPageIndex) return { ...p, bg: bgFileName };
      return p;
    }));
  };

  const addBlock = (fileName) => {
    const id = Date.now().toString() + Math.random();
    let width = 600, height = 600, x = 400, y = 400;
    let isLocked = false;

    if (fileName.toLowerCase().includes('cover')) {
      width = WIDTH; height = HEIGHT; x = 0; y = 0; isLocked = true;
    } else if (fileName.includes('header')) {
        if (fileName.includes('start')) { width = 1167; height = 100; x = 253; y = 220; } 
        else { width = 450; height = 100; x = 540; y = 100; }
    }

    const newBlock = { id, src: `/${fileName}`, x, y, width, height, locked: isLocked };
    setPages(prev => {
      const n = [...prev];
      n[currentPageIndex].blocks.push(newBlock);
      return n;
    });
    setSelectedId(id);
  };

  const applyStarter = (fileName) => {
    if (!window.confirm("Apply template?")) return;
    const starterBlock = { id: Date.now().toString() + Math.random(), src: `/${fileName}`, x: 253, y: 150, width: 1167, height: 1800, locked: true };
    setPages(prev => {
      const n = [...prev];
      n[currentPageIndex].blocks = [starterBlock];
      return n;
    });
  };

  const applyLayoutToNextPage = () => {
    if (currentPageIndex >= pages.length - 1) {
      alert("This is the last page. Add a new page first!");
      return;
    }
    const currentLayout = JSON.parse(JSON.stringify(currentPage.blocks));
    const currentBg = currentPage.bg;
    setPages(prev => prev.map((p, idx) => {
      if (idx === currentPageIndex + 1) return { ...p, blocks: currentLayout, bg: currentBg };
      return p;
    }));
    setCurrentPageIndex(currentPageIndex + 1);
  };

  const addBlankPage = () => {
    const newPage = { id: Date.now().toString() + Math.random(), name: "New Page", section: "NONE", type: "NONE", blocks: [], bg: "backgroundwithtabs.png" };
    setPages(prev => [...prev, newPage]);
    setCurrentPageIndex(pages.length);
  };

  const duplicatePage = () => {
      const newPage = JSON.parse(JSON.stringify(currentPage));
      newPage.id = Date.now().toString() + Math.random();
      newPage.name = currentPage.name + " (Copy)";
      setPages(prev => [...prev, newPage]);
      setCurrentPageIndex(pages.length); 
  };

  const renamePage = (index) => {
    const newName = window.prompt("Enter new page name:", pages[index].name);
    if (newName && newName.trim() !== "") {
      setPages(prev => {
        const n = [...prev];
        n[index].name = newName.trim();
        return n;
      });
    }
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
    if (!window.confirm("Clear all items?")) return;
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
      id: `m-${month}-${timestamp}`, name: `${month} Overview`, section: month, type: "MONTH", bg: currentBg, 
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
    for (let i = 0; i < pages.length; i++) {
      setExportProgress(Math.round(((i + 1) / pages.length) * 100));
      setCurrentPageIndex(i);
      await new Promise(r => setTimeout(r, 450)); 
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 1.5, mimeType: "image/jpeg", quality: 0.85 });
      if (i > 0) pdf.addPage([WIDTH, HEIGHT], "p");
      pdf.addImage(dataUrl, "JPEG", 0, 0, WIDTH, HEIGHT, undefined, 'FAST');
    }
    setExportProgress(null);
    pdf.save("Therapist_Planner_2026.pdf");
  };

  if (!isUnlocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f0f2f5', fontFamily: 'sans-serif' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '15px', boxShadow: '0 8px 30px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px' }}>
          <h1 style={{ color: '#4f46e5' }}>Planner Studio</h1>
          <input type="text" placeholder="License Key" value={licenseInput} onChange={(e) => setLicenseInput(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '2px solid #ddd' }} />
          <button onClick={checkLicense} style={{ width: '100%', padding: '12px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Unlock Access</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f0f2f5", overflow: "hidden" }}>
      {exportProgress !== null && (
        <div style={overlayStyle}>
          <div style={progressCard}><h3>Exporting {exportProgress}%</h3></div>
        </div>
      )}

      <div style={{ width: "320px", background: "white", padding: "20px", overflowY: "auto", borderRight: "1px solid #ddd" }}>
        <h2 style={{fontSize: '20px', fontWeight: 'bold', marginBottom: '10px'}}>Designer</h2>
        
        {selectedId && (
            <div style={{ marginBottom: '20px', padding: '10px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee' }}>
                <button onClick={toggleLock} style={actionBtn}>{selectedBlock?.locked ? "🔓 Unlock Cover/Item" : "🔒 Lock Item"}</button>
                <button onClick={deleteBlock} style={{...actionBtn, color: '#ff4d4f', marginTop: '5px'}}>🗑️ Delete</button>
            </div>
        )}

        <SectionTitle>Backgrounds & Themes</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px", marginBottom: "5px" }}>
            {['backgroundwithtabs.png', 'glitter.png', 'mermaid.png', 'neutral.png', 'rainbow.png', 'marble.png', 'cheetah.png', 'gingham.png'].map(bg => (
              <button key={bg} onClick={() => changeBackground(bg)} style={smallBtn}>{bg.split('.')[0]}</button>
            ))}
        </div>
        <button onClick={() => changeBackground(currentPage.bg, true)} style={{...smallBtn, width:'100%', background:'#e1f5fe', color:'#01579b', marginBottom:'15px'}}>Apply Background to ALL</button>

        <SectionTitle>Page Management</SectionTitle>
        <div style={{display:'flex', gap:'5px', marginBottom:'5px'}}>
            <button onClick={addBlankPage} style={{flex:1.2, padding:'8px', fontSize:'11px', background:'#4f46e5', color:'white', border:'none', borderRadius:'4px'}}>➕ Add</button>
            <button onClick={duplicatePage} style={{flex:1, padding:'8px', fontSize:'11px', background:'#fff', border:'1px solid #ddd', borderRadius:'4px'}}>👯 Copy</button>
            <button onClick={clearPage} style={{flex:1, padding:'8px', fontSize:'11px', background:'#fff', border:'1px solid #ddd', color: '#ff4d4f', borderRadius:'4px'}}>🧹 Clear</button>
        </div>
        <button onClick={applyLayoutToNextPage} style={{width:'100%', padding:'10px', fontSize:'12px', background:'#4f46e5', color:'white', border:'none', borderRadius:'4px', fontWeight:'bold', marginBottom:'10px'}}>Apply Layout to Next →</button>

        <div style={{ maxHeight: "150px", overflowY: "auto", border: '1px solid #eee', borderRadius: '4px', marginBottom: '15px' }}>
          {pages.map((p, idx) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', background: currentPageIndex === idx ? "#f8fafc" : "transparent", borderBottom: '1px solid #eee' }}>
              <button onClick={() => setCurrentPageIndex(idx)} style={{ ...pageBtn(currentPageIndex === idx), flex: 1 }}>{idx + 1}. {p.name}</button>
              <button onClick={(e) => { e.stopPropagation(); renamePage(idx); }} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
            </div>
          ))}
        </div>

        <SectionTitle>Planner Covers</SectionTitle>
        {['standardcover.png', 'glittercover.png', 'mermaidcover.png', 'neutralcover.png', 'rainbowcover.png', 'marblecover.png', 'cheetahcover.png', 'ginghamcover.png'].map(cov => (
          <LibraryBtn key={cov} onClick={() => addBlock(cov)}>{cov.split('cover')[0].toUpperCase()}</LibraryBtn>
        ))}

        <SectionTitle>Starter Layouts</SectionTitle>
        {['annualplannertemplate.svg', 'dailyscheduletemplate.svg', 'taskplannertemplate.svg', 'taskplantemplate.svg', 'weeklyplantemplate.svg', 'weekscheduletemplate.svg', 'weektodotemplate.svg', 'yearoverviewtemplate.svg', 'yearpixelstemplate.svg'].map(temp => (
          <LibraryBtn key={temp} onClick={() => applyStarter(temp)}>{temp.split('template')[0]}</LibraryBtn>
        ))}

        <SectionTitle>Headers</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <LibraryBtn onClick={() => addBlock("sunstartheader.svg")}>Sun Week Strip</LibraryBtn>
            <LibraryBtn onClick={() => addBlock("monstartheader.svg")}>Mon Week Strip</LibraryBtn>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2px", marginTop:'5px' }}>
                {["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].map(m => (
                    <button key={m} onClick={() => addBlock(`${m}header.svg`)} style={{fontSize:'8px', padding:'4px'}}>{m.toUpperCase()}</button>
                ))}
            </div>
        </div>

        <SectionTitle>Clinical Templates</SectionTitle>
        {["ThoughtLog.svg", "InsuranceTracker.svg", "BillingTracker.svg", "CEUTracker.svg", "DailySessions.svg", "GoalPlanner.svg", "WeeklySchedule.svg"].map(temp => (
          <LibraryBtn key={temp} onClick={() => addBlock(temp)}>{temp.split('.')[0]}</LibraryBtn>
        ))}

        <SectionTitle>Note Templates</SectionTitle>
        {["BulletNotes.svg", "NoteLines.svg", "CornellNotes.svg", "TopicNotes.svg", "sessionnotes.svg"].map(temp => (
          <LibraryBtn key={temp} onClick={() => addBlock(temp)}>{temp.split('.')[0]}</LibraryBtn>
        ))}

        <SectionTitle>Trackers</SectionTitle>
        {["HabitTracker.svg", "MoodTracker.svg", "WaterTracker.svg", "Tracker.svg", "EnergyTracker.svg"].map(temp => (
          <LibraryBtn key={temp} onClick={() => addBlock(temp)}>{temp.split('.')[0]}</LibraryBtn>
        ))}

        <SectionTitle>Other Templates</SectionTitle>
        {["DailySchedule.svg", "ToDoList.svg", "Grid.svg", "MonthlyCalendar.svg", "MonthlyReview.svg", "Priorities.svg", "Reminder.svg", "WeeklyToDo.svg", "WeeklyReview.svg"].map(temp => (
          <LibraryBtn key={temp} onClick={() => addBlock(temp)}>{temp.split('.')[0]}</LibraryBtn>
        ))}

        <SectionTitle>Month Bundles</SectionTitle>
        <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
          <button onClick={() => setStartDay("sunday")} style={toggleBtn(startDay === "sunday")}>Sun</button>
          <button onClick={() => setStartDay("monday")} style={toggleBtn(startDay === "monday")}>Mon</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
          {["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].map(m => (
            <button key={m} onClick={() => addMonthBundle(m)} style={bundleBtn}>{m}</button>
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

const smallBtn = { padding: '5px', fontSize: '10px', cursor: 'pointer', background: '#fff', border: '1px solid #ddd', borderRadius: '4px' };
const overlayStyle = { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" };
const progressCard = { background: "white", padding: "30px", borderRadius: "12px", textAlign: "center" };
const progressBarBg = { width: "100%", height: "8px", background: "#eee", borderRadius: "4px", marginTop: "15px", overflow: "hidden" };
const progressBarFill = (p) => ({ width: `${p}%`, height: "100%", background: "#4caf50" });
const SectionTitle = ({ children }) => <h4 style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", marginTop: "15px", marginBottom: "5px" }}>{children}</h4>;
const bundleBtn = { padding: "6px", fontSize: "10px", background: "#eef2ff", border: "1px solid #c7d2fe", cursor: "pointer", borderRadius: "4px" };
const actionBtn = { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', cursor: 'pointer', fontSize: '11px' };
const toggleBtn = (active) => ({ flex: 1, padding: "8px", background: active ? "#4f46e5" : "#f1f3f5", color: active ? "white" : "#444", border: "none", cursor: "pointer" });
const pageBtn = (active) => ({ width: "100%", padding: "8px", textAlign: "left", background: active ? "#f8fafc" : "transparent", color: active ? "#4f46e5" : "#444", border: "none", borderLeft: active ? '4px solid #4f46e5' : '4px solid transparent', fontSize: "11px", cursor: "pointer" });
const LibraryBtn = ({ onClick, children }) => <button onClick={onClick} style={{ width: "100%", padding: "6px", background: "#fff", border: "1px solid #e2e8f0", textAlign: "left", cursor: "pointer", fontSize: "11px", marginBottom: '2px' }}>{children}</button>;
const exportBtn = { padding: "14px", background: "#4f46e5", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", width: "100%", cursor: "pointer", marginTop: '10px' };

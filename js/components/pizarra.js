// component for handling tactical board (pizarra) logic
import { confirmarAccion } from '../ui.js';
let canvas = null;
let fieldLinesGroup = null;
export let currentStep = 1;

let undoStack = [];
let isStateLocked = false;

export function getMaxSteps() {
    let max = 1;
    if (!canvas) return max;
    canvas.getObjects().forEach(o => {
        if (!o.isFieldLine && o.keyframes) {
            for (let s in o.keyframes) {
                if (parseInt(s) > max) max = parseInt(s);
            }
        }
    });
    return max;
}

export function updateStepUI() {
    let maxSteps = getMaxSteps();
    let displayMax = Math.max(maxSteps, currentStep);
    
    document.getElementById('step-display').innerText = `${currentStep}/${displayMax}`;
    const prevBtn = document.getElementById('step-prev');
    if (prevBtn) prevBtn.disabled = currentStep <= 1;

    const nextBtn = document.getElementById('step-next');
    if (nextBtn) {
        if (currentStep < displayMax) {
            nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right text-[10px]"></i>';
            nextBtn.title = "Paso siguiente";
        } else {
            nextBtn.innerHTML = '<i class="fa-solid fa-plus text-[10px]"></i>';
            nextBtn.title = "Añadir nuevo paso";
        }
    }

    const delBtn = document.getElementById('step-delete');
    if (delBtn) {
        if (currentStep === displayMax && displayMax > 1) {
            delBtn.classList.remove('hidden');
        } else {
            delBtn.classList.add('hidden');
        }
    }
}

export function saveState() {
    if (isStateLocked || !canvas) return;
    
    canvas.getObjects().forEach(o => {
        if (!o.id) o.id = Math.random().toString(36).substr(2, 9);
    });
    
    const state = JSON.stringify(canvas.toJSON([
        'id', 'isPlayer', 'isBall', 'isCone', 'isPortero', 'keyframes', 'isFieldLine', 
        'hasControls', 'hasBorders', 'lockScalingX', 'lockScalingY', 'lockRotation'
    ]));
    
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === state) return;

    undoStack.push(state);
    if(undoStack.length > 30) undoStack.shift();
}

export function clearUndoStack() {
    undoStack = [];
}

export function undo() {
    if (undoStack.length <= 1 || isStateLocked || !canvas) return;
    
    isStateLocked = true;
    undoStack.pop(); 
    const prevState = undoStack[undoStack.length - 1]; 
    
    const activeObjects = canvas.getActiveObjects();
    if(activeObjects.length) {
        canvas.discardActiveObject();
    }
    
    canvas.loadFromJSON(prevState, () => {
        fieldLinesGroup = null;
        let type = document.getElementById('pizarra-fondo') ? document.getElementById('pizarra-fondo').value : 'completo';
        drawField(type);
        canvas.renderAll();
        isStateLocked = false;
    });
}


const canvasDims = {
    'completo': { w: 600, h: 400 },
    'medio': { w: 500, h: 450 },
    'area': { w: 600, h: 320 },
    'cuadrado': { w: 400, h: 400 },
    'cuadricula2': { w: 400, h: 400 },
    'cuadricula3': { w: 450, h: 450 }
};

export function getCanvas() {
    return canvas;
}

export function drawField(type) {
    if (!canvas) return;
    if (fieldLinesGroup) canvas.remove(fieldLinesGroup);
    canvas.getObjects().forEach(o => {
        if (o.type === 'group' && o.getObjects().length >= 5) {
            canvas.remove(o);
        }
    });

    const elements = [];
    const strokeColor = 'rgba(255,255,255,0.6)';
    const sw = 2; // strokeWidth
    const greenFill = '#10b981'; 
    
    const rectTransp = (l, t, w, h) => new fabric.Rect({ left: l, top: t, width: w, height: h, fill: 'transparent', stroke: strokeColor, strokeWidth: sw });
    const rectFill = (l, t, w, h) => new fabric.Rect({ left: l, top: t, width: w, height: h, fill: greenFill, stroke: strokeColor, strokeWidth: sw });
    const line = (x1, y1, x2, y2) => new fabric.Line([x1, y1, x2, y2], { stroke: strokeColor, strokeWidth: sw });
    const circleTransp = (l, t, r) => new fabric.Circle({ left: l, top: t, radius: r, fill: 'transparent', stroke: strokeColor, strokeWidth: sw, originX: 'center', originY: 'center' });
    const arc = (l, t, r, startA, endA) => new fabric.Circle({ left: l, top: t, radius: r, fill: 'transparent', stroke: strokeColor, strokeWidth: sw, originX: 'center', originY: 'center', startAngle: startA, endAngle: endA });
    const dot = (l, t) => new fabric.Circle({ left: l, top: t, radius: 2.5, fill: strokeColor, originX: 'center', originY: 'center' });

    if (type === 'completo') {
        const w = 560, h = 360, l0 = 20, t0 = 20;
        elements.push(rectTransp(l0, t0, w, h));
        elements.push(line(l0+w/2, t0, l0+w/2, t0+h));
        elements.push(circleTransp(l0+w/2, t0+h/2, 60));
        elements.push(dot(l0+w/2, t0+h/2));

        // Corner arcs
        elements.push(arc(l0, t0, 10, 0, Math.PI/2));
        elements.push(arc(l0+w, t0, 10, Math.PI/2, Math.PI));
        elements.push(arc(l0, t0+h, 10, Math.PI*1.5, Math.PI*2));
        elements.push(arc(l0+w, t0+h, 10, Math.PI, Math.PI*1.5));

        // Left side
        elements.push(circleTransp(l0+65, t0+h/2, 50));  // D arc
        elements.push(rectFill(l0, t0+(h/2)-90, 85, 180)); // Penalty box
        elements.push(rectTransp(l0, t0+(h/2)-35, 30, 70)); // Goal area
        elements.push(dot(l0+65, t0+h/2)); // Penalty mark
        elements.push(rectTransp(l0-15, t0+(h/2)-25, 15, 50)); // Goal

        // Right side
        elements.push(circleTransp(l0+w-65, t0+h/2, 50));
        elements.push(rectFill(l0+w-85, t0+(h/2)-90, 85, 180)); 
        elements.push(rectTransp(l0+w-30, t0+(h/2)-35, 30, 70)); 
        elements.push(dot(l0+w-65, t0+h/2)); 
        elements.push(rectTransp(l0+w, t0+(h/2)-25, 15, 50));
        
    } else if (type === 'medio') {
        const w = 460, h = 330, l0 = 20, t0 = 20;
        // Outline field
        elements.push(rectTransp(l0, t0, w, h));
        // Center circle (full circle visible)
        elements.push(circleTransp(l0+w/2, t0+h, 70)); 
        elements.push(dot(l0+w/2, t0+h));
        
        // Corners arcs at the top
        elements.push(arc(l0, t0, 10, 0, Math.PI/2));
        elements.push(arc(l0+w, t0, 10, Math.PI/2, Math.PI));

        // Top Area
        elements.push(circleTransp(l0+w/2, t0+80, 60)); // D arc
        elements.push(rectFill(l0+(w/2)-110, t0, 220, 100)); // Penalty box
        elements.push(rectTransp(l0+(w/2)-110, t0, 220, 100)); // Penalty box boundary
        elements.push(rectTransp(l0+(w/2)-45, t0, 90, 40)); // Goal area
        elements.push(dot(l0+w/2, t0+80)); // Penalty mark
        
        // Goal
        elements.push(rectTransp(l0+(w/2)-30, t0-15, 60, 15));
        
    } else if (type === 'area') {
        const w = 560, h = 260, l0 = 20, t0 = 20;
        // Outline field - only sides and top
        elements.push(line(l0, t0, l0+w, t0)); // top sideline
        elements.push(line(l0, t0, l0, t0+h)); // left sideline
        elements.push(line(l0+w, t0, l0+w, t0+h)); // right sideline
        
        // Area bounds
        const pw = 300, ph = 120, gw = 100, gh = 40;
        elements.push(circleTransp(l0+w/2, t0+90, 70)); // D arc
        elements.push(rectFill(l0+(w/2)-(pw/2), t0, pw, ph)); // Penalty box backgr
        elements.push(rectTransp(l0+(w/2)-(pw/2), t0, pw, ph)); // Penalty box lines
        elements.push(rectTransp(l0+(w/2)-(gw/2), t0, gw, gh)); // Goal area
        elements.push(dot(l0+w/2, t0+90)); // Penalty mark
        
        // Goal
        elements.push(rectTransp(l0+(w/2)-35, t0-15, 70, 15));
        
    } else if (type === 'cuadrado') {
        const w = 360, h = 360, l0 = 20, t0 = 20;
        elements.push(rectTransp(l0, t0, w, h));
    } else if (type === 'cuadricula2') {
        const w = 360, h = 360, l0 = 20, t0 = 20;
        elements.push(rectTransp(l0, t0, w, h));
        elements.push(line(l0+w/2, t0, l0+w/2, t0+h));
        elements.push(line(l0, t0+h/2, l0+w, t0+h/2));
    } else if (type === 'cuadricula3') {
        const w = 405, h = 405, l0 = 20, t0 = 20;
        elements.push(rectTransp(l0, t0, w, h));
        elements.push(line(l0+w/3, t0, l0+w/3, t0+h));
        elements.push(line(l0+w*2/3, t0, l0+w*2/3, t0+h));
        elements.push(line(l0, t0+h/3, l0+w, t0+h/3));
        elements.push(line(l0, t0+h*2/3, l0+w, t0+h*2/3));
    }

    fieldLinesGroup = new fabric.Group(elements, {
        selectable: false, evented: false, excludeFromExport: true,
        isFieldLine: true
    });
    canvas.add(fieldLinesGroup);
    canvas.sendToBack(fieldLinesGroup);
}

export function resizeCanvas() {
    if (!canvas) return;
    const type = document.getElementById('pizarra-fondo').value || 'completo';
    const dims = canvasDims[type];
    
    const wrapper = document.getElementById('pizarra-container-wrapper');
    if(!wrapper) return;
    
    // We want it to fit inside the wrapper both horizontally and vertically
    const isFullscreen = !!document.fullscreenElement;
    const availableWidth = wrapper.clientWidth; 
    const availableHeight = isFullscreen ? wrapper.clientHeight : (wrapper.clientHeight > 0 ? wrapper.clientHeight : window.innerHeight * 0.5);

    let scaleW = availableWidth / dims.w;
    let scaleH = availableHeight / dims.h;
    
    let scale = Math.min(scaleW, scaleH);
    if (!isFullscreen && scale > 1) scale = 1; // Don't scale up past 100% when not fullscreen
    if (scale <= 0) scale = 0.5; // fallback
    
    canvas.setDimensions({
        width: dims.w * scale,
        height: dims.h * scale
    });
    canvas.setZoom(scale);
    
    const container = document.getElementById('pizarra-container');
    container.style.width = (dims.w * scale) + 'px';
    container.style.height = (dims.h * scale) + 'px';
    
    canvas.renderAll();
}

// Ensure resize triggers zoom
window.addEventListener('resize', resizeCanvas);

export function initCanvas() {
    const type = document.getElementById('pizarra-fondo').value || 'completo';

    currentStep = 1;
    updateStepUI();

    if (canvas) {
        canvas.clear();
        drawField(type);
        resizeCanvas();
        undoStack = [];
        saveState();
        return;
    }
    
    canvas = new fabric.Canvas('pizarra-canvas', {
        backgroundColor: '#10b981',
        selection: false, // Deshabilita la selección drag box para no interferir con las flechas
        fireRightClick: true, // Habilitar click derecho
        stopContextMenu: true // Evitar menu contextual de navegador
    });

    const canvasElement = document.getElementById('pizarra-canvas');
    if (canvasElement && canvasElement.parentElement) {
        canvasElement.parentElement.addEventListener('contextmenu', e => e.preventDefault());
    }

    drawField(type);
    resizeCanvas();
    
    setupCanvasEvents();
    undoStack = [];
    saveState();
}

function setupCanvasEvents() {
    document.getElementById('pizarra-fondo').addEventListener('change', (e) => {
        const ntype = e.target.value;
        drawField(ntype);
        resizeCanvas();
    });

    const addEntity = (color, type, isBall = false) => {
        let group;
        if (isBall) {
            const text = new fabric.Text('⚽', { fontSize: 20, originX: 'center', originY: 'center' });
            group = new fabric.Group([text], {
                left: canvas.width / 2, top: canvas.height / 2, originX: 'center', originY: 'center', hasControls: false, transparentCorners: false,
                isBall: true
            });
        } else if (type === 'cono') {
            const path = new fabric.Path('M 0 20 L 10 0 L 20 20 Z', { fill: color, stroke: '#ea580c', strokeWidth: 1, originX: 'center', originY: 'center', shadow: new fabric.Shadow({color: 'rgba(0,0,0,0.3)', blur: 4, offsetY: 2}) });
            group = new fabric.Group([path], {
                left: canvas.width / 2, top: canvas.height / 2, originX: 'center', originY: 'center', hasControls: false, transparentCorners: false,
                isCone: true
            });
        } else {
            const circle = new fabric.Circle({ radius: 12, fill: color, stroke: '#ffffff', strokeWidth: 2, originX: 'center', originY: 'center', shadow: new fabric.Shadow({color: 'rgba(0,0,0,0.3)', blur: 4, offsetY: 2}) });
            const text = new fabric.Text(type === 'portero' ? '\uf4c2' : '\uf007', {
                fontFamily: '"Font Awesome 6 Free", "Font Awesome 6 Brands"', fontWeight: 900, fontSize: 13, fill: type === 'portero' ? '#fff' : (color === '#f8fafc' ? '#1e293b' : '#ffffff'), originX: 'center', originY: 'center'
            });
            group = new fabric.Group([circle, text], {
                left: canvas.width / 2, top: canvas.height / 2, originX: 'center', originY: 'center', hasControls: false, transparentCorners: false,
                isPlayer: true,
                isPortero: type === 'portero'
            });
        }
        
        group.keyframes = {};
        group.keyframes[currentStep] = { x: group.left, y: group.top };
        
        canvas.add(group); canvas.setActiveObject(group);
        saveState();
    };

    const colorSelect = document.getElementById('tool-color');
    const toolPlayerBtn = document.getElementById('tool-player');
    const toolPorteroBtn = document.getElementById('tool-portero');
    
    const updateIconColors = () => {
        const color = colorSelect.value;
        colorSelect.style.color = color;
        toolPlayerBtn.style.color = color;
        toolPorteroBtn.style.color = color;
    };
    
    const getColor = () => colorSelect.value;
    colorSelect.addEventListener('change', updateIconColors);
    // Set initial color
    updateIconColors();

    toolPlayerBtn.addEventListener('click', () => addEntity(getColor(), 'jugador'));
    toolPorteroBtn.addEventListener('click', () => addEntity(getColor(), 'portero'));
    document.getElementById('tool-balon').addEventListener('click', () => addEntity(null, null, true));
    document.getElementById('tool-cono').addEventListener('click', () => addEntity('#f97316', 'cono'));

    document.getElementById('tool-limpiar').addEventListener('click', async () => {
        if(await confirmarAccion('¿Limpiar toda la pizarra?')) {
            canvas.clear();
            const type = document.getElementById('pizarra-fondo').value;
            drawField(type);
            resizeCanvas();
            currentStep = 1;
            updateStepUI();
            saveState();
        }
    });

    document.getElementById('tool-undo').addEventListener('click', () => {
        undo();
    });

    document.getElementById('tool-borrar').addEventListener('click', () => {
        const activeObject = canvas.getActiveObject();
        if (activeObject && !activeObject.isFieldLine) {
            canvas.remove(activeObject);
            saveState();
        }
    });

    const btnFullscreen = document.getElementById('tool-fullscreen');
    const wrapper = document.getElementById('pizarra-container-wrapper');
    if (btnFullscreen && wrapper) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                wrapper.requestFullscreen().catch(err => {
                    console.error(`Error pant. completa: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        });

        const btnPlayFullscreen = document.getElementById('tool-play-fullscreen');

        document.addEventListener('fullscreenchange', () => {
             if (!document.fullscreenElement) {
                 btnFullscreen.innerHTML = '<i class="fa-solid fa-expand"></i>';
                 wrapper.classList.remove('h-screen');
                 if(btnPlayFullscreen) {
                     btnPlayFullscreen.classList.add('hidden');
                     btnPlayFullscreen.classList.remove('flex');
                 }
             } else {
                 btnFullscreen.innerHTML = '<i class="fa-solid fa-compress"></i>';
                 wrapper.classList.add('h-screen');
                 if(btnPlayFullscreen) {
                     btnPlayFullscreen.classList.remove('hidden');
                     btnPlayFullscreen.classList.add('flex');
                 }
             }
             setTimeout(resizeCanvas, 100);
        });
    }
    
    function getPosForStep(obj, step) {
        if (!obj.keyframes) return { x: obj.left, y: obj.top }; 
        if (obj.keyframes[step]) return obj.keyframes[step];
        
        let bestBefore = -1;
        let posBefore = null;
        for (let s in obj.keyframes) {
            let sNum = parseInt(s);
            if (sNum <= step && sNum > bestBefore) {
                bestBefore = sNum;
                posBefore = obj.keyframes[s];
            }
        }
        if (posBefore) return posBefore;
        
        let bestAfter = Infinity;
        let posAfter = null;
        for (let s in obj.keyframes) {
            let sNum = parseInt(s);
            if (sNum > step && sNum < bestAfter) {
                bestAfter = sNum;
                posAfter = obj.keyframes[s];
            }
        }
        if (posAfter) return posAfter;
        return { x: obj.left, y: obj.top };
    }

    function applyStep(step) {
        let objs = canvas.getObjects();
        let changed = false;
        objs.forEach(o => {
            if (!o.isFieldLine && o.keyframes) {
                let pos = getPosForStep(o, step);
                if (o.left !== pos.x || o.top !== pos.y) {
                    o.set({ left: pos.x, top: pos.y });
                    o.setCoords();
                    changed = true;
                }
            }
        });
        if (changed) canvas.renderAll();
    }



    document.getElementById('step-delete').addEventListener('click', async () => {
        let maxSteps = getMaxSteps();
        let displayMax = Math.max(maxSteps, currentStep);
        if (displayMax > 1 && currentStep === displayMax) {
            if (await confirmarAccion('¿Seguro que quieres borrar este último paso?')) {
                canvas.getObjects().forEach(o => {
                    if (!o.isFieldLine && o.keyframes && o.keyframes[currentStep]) {
                        delete o.keyframes[currentStep];
                    }
                });
                currentStep--;
                applyStep(currentStep); // Volver al paso anterior visualmente
                saveState();
                updateStepUI();
            }
        }
    });

    document.getElementById('step-prev').addEventListener('click', () => { 
        if(currentStep > 1) { 
            currentStep--; 
            updateStepUI();
            applyStep(currentStep);
        } 
    });
    document.getElementById('step-next').addEventListener('click', () => { 
        currentStep++; 
        updateStepUI();
        applyStep(currentStep);
    });

    const disableControls = (e) => {
        if(e.target && !e.target.isFieldLine) {
            e.target.set('hasControls', false);
            e.target.set('hasBorders', true);
            e.target.set('lockScalingX', true);
            e.target.set('lockScalingY', true);
            e.target.set('lockRotation', true);
            e.target.setControlsVisibility({
                bl: false, br: false, tl: false, tr: false, mt: false, mb: false, ml: false, mr: false, mtr: false
            });
        }
    };

    canvas.on('selection:created', disableControls);
    canvas.on('selection:updated', disableControls);

    let lastClickTime = 0;
    let lastClickedTarget = null;
    canvas.on('mouse:down', (e) => {
        let now = new Date().getTime();
        // Check for double click manually or right click
        if (e.target && e.target.isPortero) {
            let isDblClick = (now - lastClickTime < 300) && (lastClickedTarget === e.target);
            // Right click (button 2) OR Double click
            if (e.e && e.e.button === 2 || isDblClick) {
                let currentAngle = e.target.angle || 0;
                e.target.set('angle', currentAngle + 90);
                canvas.renderAll();
                saveState();
                // Reset to avoid tripple clicks causing multiple rotations
                lastClickTime = 0;
                lastClickedTarget = null;
                return;
            }
        }
        lastClickTime = now;
        lastClickedTarget = e.target;
    });

    canvas.on('object:modified', (e) => {
        if (e.target && !e.target.isFieldLine) {
            if (!e.target.keyframes) e.target.keyframes = {};
            e.target.keyframes[currentStep] = { x: e.target.left, y: e.target.top };
        }
        saveState();
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undo();
            }
        }
    });

    async function playAnimation(btnId) {
        const btn = document.getElementById(btnId);
        if(!btn) return;
        const icon = btn.querySelector('i');
        if (icon && icon.classList.contains('fa-spinner')) return; 
        
        const otherBtnId = btnId === 'tool-play' ? 'tool-play-fullscreen' : 'tool-play';
        const otherBtn = document.getElementById(otherBtnId);
        const otherIcon = otherBtn ? otherBtn.querySelector('i') : null;

        if (icon) icon.className = 'fa-solid fa-spinner fa-spin mr-1';
        if (otherIcon) otherIcon.className = 'fa-solid fa-spinner fa-spin mr-1';
        
        const objs = canvas.getObjects().filter(o => !o.isFieldLine && o.keyframes);
        let maxSteps = 1;
        objs.forEach(o => {
            for (let s in o.keyframes) {
                if (parseInt(s) > maxSteps) maxSteps = parseInt(s);
            }
            // Save starting pos to restore
            o.animStart = { left: o.left, top: o.top }; 
            let pos1 = getPosForStep(o, 1);
            o.set({ left: pos1.x, top: pos1.y });
            o.setCoords();
        });
        canvas.renderAll();

        const animDuration = 1000;

        for (let targetStep = 2; targetStep <= maxSteps; targetStep++) {
            const promises = [];
            objs.forEach(obj => {
                let currentX = obj.left;
                let currentY = obj.top;
                let targetPos = getPosForStep(obj, targetStep);
                
                if (currentX !== targetPos.x || currentY !== targetPos.y) {
                    promises.push(new Promise(resolve => {
                        fabric.util.animate({
                            startValue: 0, endValue: 1, duration: animDuration,
                            onChange: function (val) {
                                obj.set({
                                    left: currentX + (targetPos.x - currentX) * val,
                                    top: currentY + (targetPos.y - currentY) * val
                                });
                                obj.setCoords();
                                canvas.renderAll();
                            },
                            onComplete: function() {
                                resolve();
                            }
                        });
                    }));
                }
            });
            
            if (promises.length > 0) {
                await Promise.all(promises);
            } else {
                // Wait briefly if nothing shifted to see the paused frame
                await new Promise(r => setTimeout(r, animDuration / 2));
            }
        } 

        setTimeout(() => {
            objs.forEach(o => {
                if (o.animStart) {
                    o.set({left: o.animStart.left, top: o.animStart.top});
                    o.setCoords();
                }
            });
            canvas.renderAll();
            applyStep(currentStep); // Return visual state to currentStep in editor
            
            if (icon) icon.className = 'fa-solid fa-play mr-1';
            if (otherIcon) otherIcon.className = 'fa-solid fa-play mr-1';
        }, 1500);
    }

    document.getElementById('tool-play').addEventListener('click', () => playAnimation('tool-play'));
    const pfBtn = document.getElementById('tool-play-fullscreen');
    if(pfBtn) pfBtn.addEventListener('click', () => playAnimation('tool-play-fullscreen'));
}

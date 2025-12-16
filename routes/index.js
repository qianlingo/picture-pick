const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Data Storage Structure
// {
//   activeProjectId: "...",
//   projects: [ { id, name, filePath, xSelected, currentRound, roundImages, currentRoundSelections, lastFileName } ]
// }

function loadData() {
    try {
        if (fs.existsSync(PROJECTS_FILE)) {
            return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Error loading projects:", e);
    }
    // Default initial state
    const defaultProject = {
        id: 'default',
        name: '默认项目',
        filePath: 'C:\\Users\\admin\\Documents\\MuMu共享文件夹\\Pictures\\Telegram',
        xSelected: 'X选项内容',
        currentRound: 1,
        roundSelections: {}, // Stores selections for each round: { "1": [...], "2": [...] }
        lastFileName: ""
    };
    return {
        activeProjectId: 'default',
        projects: [defaultProject]
    };
}

function saveData(data) {
    try {
        fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error saving projects:", e);
    }
}

let appData = loadData();

// Data Migration (if needed)
appData.projects.forEach(p => {
    if (!p.roundSelections) {
        p.roundSelections = {};
        // Migrate old structure if present
        if (p.currentRoundSelections && p.currentRoundSelections.length > 0) {
            p.roundSelections[p.currentRound] = p.currentRoundSelections;
        }
    }
    // Clean up old fields
    delete p.roundImages;
    delete p.currentRoundSelections;
});
saveData(appData);

function getActiveProject() {
    let project = appData.projects.find(p => p.id === appData.activeProjectId);
    if (!project && appData.projects.length > 0) {
        // Fallback if active ID is invalid
        appData.activeProjectId = appData.projects[0].id;
        project = appData.projects[0];
        saveData(appData);
    }
    return project;
}

// 读取目录下的图片文件
function getImagesFromDir(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) return [];
        const files = fs.readdirSync(dirPath);
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        return files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return imageExtensions.includes(ext);
        });
    } catch (err) {
        console.error("Error reading directory:", err);
        return [];
    }
}

router.get('/', (req, res) => {
    const project = getActiveProject();
    if (!project) {
        return res.render('index', { 
            project: null,
            projects: appData.projects,
            imageList: [],
            fileName: "",
            currentMode: 'single',
            currentRoundSelections: []
        });
    }

    // Update fileName if provided in query
    if (req.query.file) {
        project.lastFileName = req.query.file;
        saveData(appData); // Persist selection
    }

    // Auto-select file if needed
    let fileName = project.lastFileName;
    
    // Get Image List based on Round
    let imageList = [];
    if (project.currentRound === 1) {
        imageList = getImagesFromDir(project.filePath);
    } else {
        // Input for Round N is Output of Round N-1
        imageList = project.roundSelections[project.currentRound - 1] || [];
    }
    
    // Ensure current round selections array exists
    if (!project.roundSelections[project.currentRound]) {
        project.roundSelections[project.currentRound] = [];
    }
    const currentRoundSelections = project.roundSelections[project.currentRound];
    
    // Calculate Max Round
    const roundKeys = Object.keys(project.roundSelections).map(Number);
    const maxRound = roundKeys.length > 0 ? Math.max(...roundKeys, project.currentRound) : project.currentRound;

    if ((!fileName || !imageList.includes(fileName)) && imageList.length > 0) {
        fileName = imageList[0];
        project.lastFileName = fileName;
        saveData(appData);
    } else if (imageList.length === 0) {
        fileName = "";
    }

    res.render('index', {
        project,
        projects: appData.projects,
        fileName,
        imageList,
        currentRoundSelections, // Explicitly pass this
        maxRound,
        currentMode: req.query.mode || 'single'
    });
});

// Image Serving
router.get('/image', (req, res) => {
    const project = getActiveProject();
    const imageName = req.query.name;
    if (!imageName || !project || !project.filePath) {
        return res.status(404).send('Image not found');
    }
    const fullPath = path.join(project.filePath, imageName);
    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else {
        res.status(404).send('Image not found');
    }
});

// --- Settings & Project Management ---

router.post('/updateSettings', (req, res) => {
    const project = getActiveProject();
    if (project) {
        const { xSelected, filePath } = req.body;
        project.xSelected = xSelected;
        project.filePath = filePath;
        saveData(appData);
    }
    res.redirect('/');
});

router.post('/createProject', (req, res) => {
    const { name, filePath } = req.body;
    const newProject = {
        id: crypto.randomUUID(),
        name: name || '新项目',
        filePath: filePath || '',
        xSelected: '',
        currentRound: 1,
        roundSelections: {},
        lastFileName: ""
    };
    appData.projects.push(newProject);
    appData.activeProjectId = newProject.id;
    saveData(appData);
    res.redirect('/');
});

router.post('/switchProject', (req, res) => {
    const { projectId } = req.body;
    if (appData.projects.find(p => p.id === projectId)) {
        appData.activeProjectId = projectId;
        saveData(appData);
    }
    res.redirect('/');
});

router.post('/switchRound', (req, res) => {
    const project = getActiveProject();
    const { round } = req.body;
    if (project && round) {
        project.currentRound = parseInt(round);
        project.lastFileName = ""; // Reset file selection on round switch
        saveData(appData);
    }
    res.redirect('/');
});

router.post('/deleteProject', (req, res) => {
    const { projectId } = req.body;
    if (appData.projects.length <= 1) {
        // Prevent deleting the last project
        return res.redirect('/'); 
    }
    appData.projects = appData.projects.filter(p => p.id !== projectId);
    if (appData.activeProjectId === projectId) {
        appData.activeProjectId = appData.projects[0].id;
    }
    saveData(appData);
    res.redirect('/');
});

// --- Selection Logic ---

router.post('/toggleSelection', (req, res) => {
    const project = getActiveProject();
    if (!project) return res.json({ success: false });

    const { fileName } = req.body;
    if (!fileName) return res.json({ success: false });

    if (!project.roundSelections[project.currentRound]) {
        project.roundSelections[project.currentRound] = [];
    }
    const selections = project.roundSelections[project.currentRound];

    if (selections.includes(fileName)) {
        project.roundSelections[project.currentRound] = selections.filter(f => f !== fileName);
    } else {
        project.roundSelections[project.currentRound].push(fileName);
    }
    saveData(appData); // Save state immediately
    res.json({ success: true, selected: project.roundSelections[project.currentRound].includes(fileName) });
});

router.post('/finishRound', (req, res) => {
    const project = getActiveProject();
    if (!project) return res.json({ success: false });

    try {
        const data = {
            round: project.currentRound,
            selections: project.roundSelections[project.currentRound] || []
        };
        const savePath = path.join(project.filePath, `selection_round_${project.currentRound}.json`);
        fs.writeFileSync(savePath, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.json({ success: false, error: e.message });
    }
});

router.post('/nextRound', (req, res) => {
    const project = getActiveProject();
    if (!project) return res.json({ success: false });

    const currentSelections = project.roundSelections[project.currentRound] || [];

    if (currentSelections.length === 0) {
        return res.json({ success: false, message: "No images selected" });
    }
    
    const nextRound = project.currentRound + 1;
    const { force } = req.body;

    // Check if next round already has data
    if (project.roundSelections[nextRound] && project.roundSelections[nextRound].length > 0 && !force) {
         return res.json({ success: false, requireConfirmation: true, message: "Next round already has selections. Overwrite?" });
    }

    // Initialize next round
    // Actually we don't need to "initialize" it with images because GET / calculates input based on previous round's output.
    // We just increment the round counter.
    // If we are "overwriting", we might want to clear the NEXT round's selections?
    // Requirement says: "if yes, overwrite". This implies clearing the existing next round selections?
    // Or does it mean "overwrite the INPUT for the next round"? 
    // Since input for Round N+1 is derived dynamically from Round N, changing Round N implicitly changes input for N+1.
    // The "overwrite" probably refers to the *selections* made in Round N+1 (which might be invalid now).
    
    if (force || (project.roundSelections[nextRound] && project.roundSelections[nextRound].length > 0)) {
         // If we are forcing, or if we are overwriting, we should probably clear the future round's selections 
         // because the input set has changed.
         project.roundSelections[nextRound] = [];
    }

    project.currentRound++;
    project.lastFileName = "";
    saveData(appData);
    res.json({ success: true });
});

module.exports = router;

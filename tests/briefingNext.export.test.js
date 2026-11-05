const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
test('legacy export failure disposes isolated canvas without mutating live canvas or active page',async()=>{
 const live={sentinel:'live',toJSON:()=>({objects:[]})},state={curIdx:1,title:'Demo',projectId:'p',slides:[{json:{objects:[]}},{json:{objects:[]}}],fabricCanvas:live};const before=JSON.stringify(state);let disposed=0,captured=0;const messages=[];
 const sandbox={BRF_STUDIO:state,BRF_CANVAS_W:1280,BRF_CANVAS_H:720,saveCurrentSlideJson:()=>{},pickPdfLang:async()=> 'fr',toast:m=>messages.push(m),console:{error:()=>{}},setTimeout,clearTimeout,document:{fonts:{ready:Promise.resolve()},createElement:()=>({})},
 window:{jspdf:{jsPDF:class{addPage(){}addImage(){}}}},fabric:{StaticCanvas:class{loadFromJSON(json,done){done();}renderAll(){}toDataURL(){if(++captured===2)throw new Error('image failed');return 'data:image/jpeg;base64,AA';}dispose(){disposed++;}}}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('public/js/13-briefing-studio-slides.js','utf8'),sandbox);await sandbox.briefingStudioExportPDF();assert.equal(JSON.stringify(state),before);assert.equal(disposed,2);assert.ok(messages.some(m=>m.includes('image failed')));
});

(() => {
  const data = JSON.parse(document.getElementById('story-data').textContent);
  const routes = data.routes.map(item => item.id);
  const routeInfo = new Map(data.routes.map(item => [item.id,item]));
  const chapters = new Map(data.chapters.map(item => [item.id,item]));
  const viewport = document.querySelector('.viewport');
  const world = document.querySelector('.world');
  const mobile = matchMedia('(max-width:800px)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const dialog = document.getElementById('sources-dialog');
  const options = document.querySelector('.options');
  const storageKey = 'ai-final-paper-story-v3';
  const aliases = {opening:'used',intro:'trust',thanks:'closing','life.menu':'life','life.language':'life','life.trip':'life','work.code':'work.programmers','concerns.ethics':'concerns.people','concerns.privacy':'concerns.people','concerns.energy':'concerns.physical','concerns.community':'concerns.physical'};
  const normalise = route => aliases[route] || route;
  const printRoute = normalise(new URLSearchParams(location.search).get('print'));
  const chapterOf = route => ['history','life'].includes(route) ? route : route.split('.')[0];
  const isAtlas = route => route === 'map' || chapters.has(chapterOf(route));
  const valid = route => route === 'map' || routes.includes(route);
  let state = {route:'cover',lastRoute:'history',mapMode:'route',panels:{history:'history',life:'life',work:'work.impact',concerns:'concerns.knowledge'},camera:null,viewport:null};
  let camera = {x:0,y:0,scale:1};
  let drag = null;
  let suppressClick = false;
  let motionTimer;
  let resizeTimer;
  let animations = [];

  function save() {
    if (printRoute) return;
    if (!mobile.matches) {
      state.camera={...camera};
      state.viewport={width:viewport.clientWidth,height:viewport.clientHeight};
    }
    try {localStorage.setItem(storageKey,JSON.stringify(state));} catch (_) {}
    if (location.hash !== '#'+state.route) history.replaceState(null,'','#'+state.route);
  }
  function draw(animate=false) {
    clearTimeout(motionTimer);
    world.classList.toggle('is-moving',animate && !reduced.matches);
    world.style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
    motionTimer=setTimeout(()=>world.classList.remove('is-moving'),880);
  }
  function focus(chapter,animate=true) {
    if (mobile.matches && !printRoute) {window.scrollTo({top:0,behavior:'instant'});return;}
    const node=document.getElementById('node-'+chapter);
    const scale=Math.min((viewport.clientWidth-90)/node.offsetWidth,(viewport.clientHeight-45)/node.offsetHeight);
    camera={x:viewport.clientWidth/2-(node.offsetLeft+node.offsetWidth/2)*scale,y:viewport.clientHeight/2-(node.offsetTop+node.offsetHeight/2)*scale,scale};
    draw(animate);
  }
  function fit(animate=true) {
    if (mobile.matches && !printRoute) {window.scrollTo({top:0,behavior:'instant'});return;}
    const scale=Math.min((viewport.clientWidth-50)/4520,(viewport.clientHeight-30)/2900);
    camera={x:(viewport.clientWidth-4520*scale)/2,y:(viewport.clientHeight-2900*scale)/2,scale};
    draw(animate);
  }
  function zoomBy(factor,x=viewport.clientWidth/2,y=viewport.clientHeight/2) {
    const scale=Math.max(.12,Math.min(1.5,camera.scale*factor));
    const ratio=scale/camera.scale;
    camera={x:x-(x-camera.x)*ratio,y:y-(y-camera.y)*ratio,scale};
    draw();save();
  }
  function render() {
    const atlas=isAtlas(state.route);
    const map=state.route==='map';
    document.body.dataset.scene=atlas?'atlas':state.route;
    document.body.dataset.map=String(map);
    document.body.dataset.mapMode=state.mapMode;
    viewport.inert=!atlas;
    document.querySelectorAll('[data-stage]').forEach(stage=>{stage.hidden=stage.dataset.stage!==state.route;});
    const chapter=chapterOf(state.route);
    document.querySelectorAll('.story-node').forEach(node=>{
      const topic=node.id.replace('node-','');
      const active=atlas && chapter===topic;
      node.classList.toggle('is-active',active);
      node.querySelector('.region-entry').inert=!map;
      node.querySelectorAll('[data-panel]').forEach(panel=>{
        panel.hidden=panel.dataset.panel!==state.panels[topic];
        panel.inert=!active || map;
      });
      const chapterRoutes=chapters.get(topic).routes;
      const number=chapterRoutes.indexOf(state.panels[topic])+1;
      node.querySelector('.section-position').textContent=chapterRoutes.length>1?String(number).padStart(2,'0')+' / '+String(chapterRoutes.length).padStart(2,'0'):'';
    });
    const index=routes.indexOf(state.route);
    const fallback=routes.indexOf(state.lastRoute);
    const position=(index<0?fallback:index)+1;
    document.getElementById('chapter-label').textContent=map?(state.mapMode==='route'?'Today’s route':'Map'):atlas?chapters.get(chapter).title:'';
    document.getElementById('route-label').textContent=routeInfo.get(state.route)?.title || 'Map';
    document.querySelector('.map-hint').hidden=!map;
    document.querySelector('.map-hint').textContent=state.mapMode==='route'?'History → Life → Work → Concerns':'Choose a chapter. Drag to explore. Scroll to zoom.';
    document.getElementById('route-count').textContent=map && state.mapMode==='explore'?'Explore':String(position).padStart(2,'0')+' / '+routes.length;
    document.querySelector('.nav-progress').setAttribute('aria-valuenow',String(position));
    document.querySelector('.nav-progress span').style.width=((position-1)/(routes.length-1)*100)+'%';
    document.querySelector('[data-back]').disabled=state.route==='cover';
    document.querySelector('[data-next]').disabled=state.route==='closing';
    document.querySelector('button[data-map]').setAttribute('aria-pressed',String(map));
  }
  function go(route,animate=true,restore=false,mapMode=null) {
    const previous=state.route;
    animations.forEach(animation=>animation.cancel());
    animations=[];
    if(mapMode)state.mapMode=mapMode;
    route=normalise(route);
    if (!valid(route)) route='cover';
    state.route=route;
    if (route!=='map') state.lastRoute=route;
    if (isAtlas(route) && route!=='map') state.panels[chapterOf(route)]=route;
    options.open=false;
    // Do not leave focus in a stage that has just been hidden.
    if (document.activeElement?.closest('[data-stage]')) document.activeElement.blur();
    render();
    if (isAtlas(route)) {
      if (restore) draw(false);
      else if (route==='map') fit(animate);
      else focus(chapterOf(route),animate);
    } else if (mobile.matches) window.scrollTo(0,0);
    if(animate)animateArrival(previous,route);
    save();
  }
  function animateArrival(previous,route) {
    if(printRoute || reduced.matches) return;
    const backward=routes.indexOf(route)<routes.indexOf(previous);
    const direction=backward?-1:1;
    const play=(element,frames,options={})=>{
      if(!element)return;
      animations.push(element.animate(frames,{duration:450,easing:'cubic-bezier(.2,.75,.2,1)',fill:'both',...options}));
    };
    const stage=document.querySelector('[data-stage="'+route+'"]');
    if(stage) {
      if(route==='trust')play(stage,[{clipPath:backward?'inset(0 100% 0 0)':'inset(0 0 0 100%)'},{clipPath:'inset(0 0 0 0)'}],{duration:520});
      else play(stage,[{opacity:0,transform:'translateY('+direction*22+'px)'},{opacity:1,transform:'translateY(0)'}],{duration:400});
      play(stage.querySelector('h1'),[{opacity:0,transform:'translateY('+direction*40+'px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:650,delay:70});
      return;
    }
    if(route==='map') {
      play(viewport,[{opacity:.15,filter:'blur(2px)'},{opacity:1,filter:'blur(0)'}],{duration:650});
      return;
    }
    const panel=document.querySelector('[data-panel="'+route+'"]');
    const sameChapter=chapterOf(previous)===chapterOf(route);
    play(panel,[{opacity:0,transform:'translateX('+direction*(sameChapter?65:22)+'px) rotate('+(sameChapter?direction*.5:0)+'deg)'},{opacity:1,transform:'translateX(0) rotate(0deg)'}],{duration:sameChapter?470:520,delay:previous==='map'?180:40});
    panel?.querySelectorAll('.static-bar,.demand-row i').forEach((bar,index)=>play(bar,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:650,delay:200+index*100}));
    play(panel?.querySelector('.chat-matrix'),[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:850,delay:120});
    panel?.querySelectorAll('.people-pictogram svg').forEach((person,index)=>play(person,[{opacity:0,transform:'translateY(15px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,delay:160+index*40}));
  }
  function next() {
    if (state.route==='map') {go(state.mapMode==='route'?'history':state.lastRoute);return;}
    const index=routes.indexOf(state.route);
    if (index<routes.length-1) go(routes[index+1],true,false,routes[index+1]==='map'?'route':null);
  }
  function back() {
    if (state.route==='map') {go(state.mapMode==='route'?'trust':state.lastRoute);return;}
    const index=routes.indexOf(state.route);
    if (index>0) go(routes[index-1],true,false,routes[index-1]==='map'?'route':null);
  }
  function toggleMap() {if(state.route==='map')go(state.lastRoute);else go('map',true,false,'explore');}
  function reset() {
    state.panels={history:'history',life:'life',work:'work.impact',concerns:'concerns.knowledge'};
    go('cover');
  }
  document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>button.dataset.go==='cover'?reset():go(button.dataset.go)));
  document.querySelector('button[data-map]').addEventListener('click',toggleMap);
  document.querySelector('[data-next]').addEventListener('click',next);
  document.querySelector('[data-back]').addEventListener('click',back);
  document.querySelectorAll('[data-entry]').forEach(button=>button.addEventListener('click',event=>{
    if (suppressClick) {event.preventDefault();return;}
    go(chapters.get(button.dataset.entry).routes[0]);
  }));
  document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();viewport.focus();});

  viewport.addEventListener('pointerdown',event=>{
    if (mobile.matches || event.button!==0) return;
    const entry=event.target.closest('[data-entry]');
    if (event.target.closest('button,a,input,summary') && !entry) return;
    suppressClick=false;
    if (!entry) {event.preventDefault();viewport.focus({preventScroll:true});}
    if (world.classList.contains('is-moving')) {
      const matrix=new DOMMatrixReadOnly(getComputedStyle(world).transform);
      camera={x:matrix.e,y:matrix.f,scale:matrix.a};draw();
    }
    drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,startX:camera.x,startY:camera.y,entry,moved:false};
  });
  viewport.addEventListener('pointermove',event=>{
    if (!drag || drag.pointer!==event.pointerId) return;
    const x=event.clientX-drag.x,y=event.clientY-drag.y;
    if (!drag.moved && Math.hypot(x,y)<7) return;
    if (!drag.moved) {
      // Enter the map and refit before panning; focused and overview compositions have different scales.
      if (state.route!=='map') {state.route='map';state.mapMode='explore';render();fit(false);drag.startX=camera.x;drag.startY=camera.y;}
      drag.moved=true;viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-dragging');
    }
    camera.x=drag.startX+x;camera.y=drag.startY+y;draw();save();
  });
  function stopDrag() {
    suppressClick=Boolean(drag?.entry && drag.moved);
    drag=null;viewport.classList.remove('is-dragging');
    setTimeout(()=>{suppressClick=false;},0);
  }
  viewport.addEventListener('pointerup',stopDrag);
  viewport.addEventListener('pointercancel',stopDrag);
  viewport.addEventListener('wheel',event=>{
    if (mobile.matches || state.route!=='map') return;
    event.preventDefault();
    const rect=viewport.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    zoomBy(Math.exp(-event.deltaY*.0015),x,y);
  },{passive:false});
  viewport.addEventListener('dblclick',event=>{if(state.route==='map'&&!event.target.closest('[data-entry]'))fit();});

  data.sourceLinks.forEach(item=>{
    const li=document.createElement('li'),link=document.createElement('a');
    link.textContent=item.label;link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
    li.append(link);document.getElementById('source-links').append(li);
  });
  document.querySelector('[data-sources]').addEventListener('click',()=>{options.open=false;dialog.showModal();});
  document.querySelector('[data-close-sources]').addEventListener('click',()=>dialog.close());
  async function fullscreen() {
    options.open=false;
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) {document.querySelector('[data-fullscreen]').textContent='Use browser full screen';}
  }
  document.querySelector('[data-fullscreen]').addEventListener('click',fullscreen);
  document.addEventListener('click',event=>{if(!event.target.closest('.options'))options.open=false;});
  addEventListener('keydown',event=>{
    if(dialog.open || event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.target.closest('input,textarea,select'))return;
    if(options.open) {if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();return;}if(event.key==='Escape'){options.open=false;options.querySelector('summary').focus();}return;}
    if(event.key===' ' && event.target.closest('button,summary'))return;
    if([' ','ArrowRight','PageDown'].includes(event.key)){event.preventDefault();next();}
    else if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();back();}
    else if(event.key==='Home'){event.preventDefault();reset();}
    else if(event.key==='End'){event.preventDefault();go('closing');}
    else if(event.key.toLowerCase()==='m'){event.preventDefault();toggleMap();}
    else if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();}
    else if(state.route==='map' && ['+','=','-'].includes(event.key)){event.preventDefault();zoomBy(event.key==='-'?1/1.2:1.2);}
    else if(state.route==='map' && event.key==='0'){event.preventDefault();fit(false);save();}
    else if(event.key==='Escape' && !document.fullscreenElement && isAtlas(state.route)){event.preventDefault();toggleMap();}
  });
  reduced.addEventListener('change',()=>{if(reduced.matches){animations.forEach(animation=>animation.cancel());animations=[];world.classList.remove('is-moving');}});
  addEventListener('hashchange',()=>{const route=normalise(location.hash.slice(1));if(valid(route) && route!==state.route)go(route);});
  addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{if(!isAtlas(state.route))return;if(state.route==='map')fit(false);else focus(chapterOf(state.route),false);},60);
  });
  if(printRoute) {document.body.classList.add('printing');go(printRoute,false);}
  else {
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey));
      if(saved && valid(normalise(saved.route))) {
        state.route=normalise(saved.route);
        if(routes.includes(normalise(saved.lastRoute)) && saved.lastRoute!=='map')state.lastRoute=normalise(saved.lastRoute);
        if(['route','explore'].includes(saved.mapMode))state.mapMode=saved.mapMode;
        for(const [topic,chapter] of chapters){if(chapter.routes.includes(saved.panels?.[topic]))state.panels[topic]=saved.panels[topic];}
        state.camera=saved.camera;state.viewport=saved.viewport;
      }
    }catch(_){}
    const hash=normalise(location.hash.slice(1));if(hash && valid(hash))state.route=hash;
    const restore=state.route==='map' && state.viewport?.width===viewport.clientWidth && state.viewport?.height===viewport.clientHeight && state.camera && ['x','y','scale'].every(key=>Number.isFinite(state.camera[key])) && state.camera.scale>=.12 && state.camera.scale<=1.5;
    if(restore)camera={...state.camera};
    go(state.route,false,Boolean(restore));
  }
  document.documentElement.dataset.ready='true';
})();

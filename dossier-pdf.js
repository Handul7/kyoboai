// Use the device's Korean fonts, including on iOS. Each page has clickable source annotations.
window.downloadIssuePdf = async function downloadIssuePdf({title,meta,sections,sources}) {
  const width=595,height=842,margin=46,scale=2;
  const pages=[];
  let canvas,ctx,y,links,textLines;
  function newPage() {
    canvas=document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale;
    ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#17235b';ctx.font='bold 11px sans-serif';ctx.fillText('교보 뉴스브리핑  /  이슈 보고서',margin,35);
    ctx.fillStyle='#829097';ctx.fillText(String(pages.length+1),width-margin,809);
    links=[];textLines=[];pages.push({canvas,links,textLines});y=71;
  }
  function room(n) {if(y+n>775)newPage();}
  function paragraph(value,size=12,bold=false,color='#26354a',url=null) {
    const font=(bold?'bold ':'')+size+'px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    const step=Math.ceil(size*1.65);
    function line(text) {
      room(step);ctx.font=font;ctx.fillStyle=color;ctx.fillText(text,margin,y);
      if(text)textLines.push({text,size,y:height-y,width:ctx.measureText(text).width});
      if(url)links.push({x:margin,y:height-y-3,w:Math.min(width-margin*2,ctx.measureText(text).width),h:step,url});
      y+=step;
    }
    ctx.font=font;
    let current='';
    for(const ch of String(value)) {
      if(ch==='\n'){line(current);current='';continue;}
      if(current&&ctx.measureText(current+ch).width>width-2*margin){line(current.trimEnd());current=ch.trimStart();}else current+=ch;
    }
    if(current)line(current.trimEnd());
    y+=4;
  }
  newPage();paragraph(meta,10,false,'#376f65');paragraph(title,22,true,'#121c72');
  for(const section of sections){room(68);y+=10;paragraph(section.title,14,true,'#174c59');for(const line of section.lines)paragraph(line);}
  room(65);y+=10;paragraph('뉴스 출처',14,true,'#174c59');
  sources.forEach((s,i)=>paragraph('['+(i+1)+'] '+s.source+' · '+s.publishedAt.slice(0,10)+'  '+s.title,10,false,'#235597',s.url));
  const encoder=new TextEncoder(),objects=[null,null,null];
  const bytes=s=>encoder.encode(s),reserve=data=>(objects.push(data),objects.length-1);
  const kids=[];
  for(const page of pages){
    const blob=await new Promise((resolve,reject)=>page.canvas.toBlob(b=>b?resolve(b):reject(Error('PDF 페이지를 만들지 못했습니다.')),'image/jpeg',0.88));
    const jpg=new Uint8Array(await blob.arrayBuffer());page.canvas.width=page.canvas.height=1;
    const image=reserve([bytes('<< /Type /XObject /Subtype /Image /Width '+width*scale+' /Height '+height*scale+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n'),jpg,bytes('\nendstream')]);
    // ActualText stores the selectable Korean text independently of the device font.
    const textLayer=page.textLines.map(line=>{
      const hex=Array.from({length:line.text.length},(_,i)=>line.text.charCodeAt(i).toString(16).padStart(4,'0')).join('');
      const filler='x'.repeat(line.text.length),stretch=(100*line.width/(line.size*.5*filler.length)).toFixed(2);
      return '/Span << /ActualText <FEFF'+hex+'> >> BDC BT /F1 '+line.size+' Tf 3 Tr '+stretch+' Tz 1 0 0 1 '+margin+' '+line.y+' Tm ('+filler+') Tj ET EMC';
    }).join('\n');
    const drawing='q '+width+' 0 0 '+height+' 0 0 cm /PageImage Do Q\n'+textLayer+'\n';
    const contents=reserve([bytes('<< /Length '+drawing.length+' >>\nstream\n'+drawing+'endstream')]);
    const annots=page.links.filter(l=>/^https:\/\//.test(l.url)).map(l=>{
      const uri=new URL(l.url).href.replace(/[()\\]/g,'\\$&');
      return reserve([bytes('<< /Type /Annot /Subtype /Link /Rect ['+[l.x,l.y,l.x+l.w,l.y+l.h].join(' ')+'] /Border [0 0 0] /A << /S /URI /URI ('+uri+') >> >>')])+' 0 R';
    });
    kids.push(reserve([bytes('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+width+' '+height+'] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> /XObject << /PageImage '+image+' 0 R >> >> /Contents '+contents+' 0 R /Annots ['+annots.join(' ')+'] >>')])+' 0 R');
  }
  objects[1]=[bytes('<< /Type /Catalog /Pages 2 0 R >>')];objects[2]=[bytes('<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >>')];
  const parts=[bytes('%PDF-1.4\n')],offsets=[0];let length=parts[0].length;
  function add(part){parts.push(part);length+=part.length;}
  for(let i=1;i<objects.length;i++){offsets.push(length);add(bytes(i+' 0 obj\n'));objects[i].forEach(add);add(bytes('\nendobj\n'));}
  const start=length;
  add(bytes('xref\n0 '+objects.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n'));
  const url=URL.createObjectURL(new Blob(parts,{type:'application/pdf'})),a=document.createElement('a');
  a.href=url;a.download=title.replace(/[\\/:*?"<>|]/g,' ').slice(0,80)+'.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
};

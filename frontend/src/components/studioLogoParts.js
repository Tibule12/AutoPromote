// Find a transparent seam between a left-hand symbol and its wordmark.
// This authors static source viewports. It never animates or renders a movie.
export function separateStudioLogoParts(bitmap, percentage = 28) {
  const {width,height,bounds:[bx,by,bw,bh],pixels}=bitmap;
  if(bw<12||bh<8)throw Error('Choose a larger logo before separating its symbol.');
  if (!Number.isFinite(percentage)||percentage<10||percentage>60||!pixels||pixels.length!==width*height*4)
    throw Error('Choose a symbol boundary between 10% and 60% of a decoded image.');
  const target=bx+bw*percentage/100;
  const x0=Math.max(bx+1,Math.round(target-bw*.09)),x1=Math.min(bx+bw-2,Math.round(target+bw*.09));
  const n=x1-x0+1,previous=new Float64Array(n),next=new Float64Array(n),directions=new Int8Array(n*bh);
  for(let row=0;row<bh;row++){
    for(let col=0;col<n;col++){
      const x=x0+col,alpha=pixels[((by+row)*width+x)*4+3];
      let best=Infinity,step=0;
      if(row){for(let offset=-2;offset<=2;offset++)if(col+offset>=0&&col+offset<n){
        const candidate=previous[col+offset]+Math.abs(offset)*.25;
        if(candidate<best){best=candidate;step=offset;}
      }}else best=0;
      next[col]=best+alpha*alpha+Math.abs(x-target)*.005;
      directions[row*n+col]=step;
    }
    previous.set(next);
  }
  let col=0;for(let i=1;i<n;i++)if(previous[i]<previous[col])col=i;
  const seam=new Int32Array(bh);let alphaSum=0;
  for(let row=bh-1;row>=0;row--){seam[row]=x0+col;alphaSum+=pixels[((by+row)*width+seam[row])*4+3];col+=directions[row*n+col];}
  if(alphaSum/bh>8)throw Error('No clear gap found. Adjust Symbol width or use the full-logo reveal.');
  const boxes=[[width,height,-1,-1],[width,height,-1,-1]];
  for(let row=0;row<bh;row++)for(let x=bx;x<bx+bw;x++)if(pixels[((by+row)*width+x)*4+3]>32){
    const box=boxes[x<=seam[row]?0:1];box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],by+row);
    box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],by+row);
  }
  if(boxes.some(b=>b[2]-b[0]<3||b[3]-b[1]<3))throw Error('Both the symbol and wordmark need visible content.');
  const path=Array.from(seam,(x,row)=>`${x} ${by+row}`).join(' L');
  return boxes.map((box,i)=>{
    const bounds=[box[0],box[1],box[2]-box[0]+1,box[3]-box[1]+1];
    const outside=i?bx+bw:bx;
    const clip=`M${outside} ${by} L${path} L${seam[bh-1]} ${by+bh} L${outside} ${by+bh} Z`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${bounds[2]}" height="${bounds[3]}" viewBox="${bounds.join(' ')}"><defs><clipPath id="identity-part"><path d="${clip}"/></clipPath></defs><image width="${width}" height="${height}" href="${bitmap.dataUrl}" clip-path="url(#identity-part)"/></svg>`;
    return {bounds,svg};
  });
}

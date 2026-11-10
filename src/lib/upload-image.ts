// Keep each multipart request below the hosting platform's body limit.
export async function prepareUploadImage(file:File):Promise<File>{
  if(!['image/jpeg','image/png'].includes(file.type))throw new Error('IMAGE_ONLY');
  if(file.size>5*1024*1024)throw new Error('FILE_TOO_LARGE');
  if(file.size<=3*1024*1024)return file;
  const image=await createImageBitmap(file);
  try{
    const scale=Math.min(1,2400/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('INVALID_IMAGE');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.9,.8,.7]){
      const blob=await new Promise<Blob|null>(done=>canvas.toBlob(done,'image/jpeg',quality));
      if(blob&&blob.size<=3*1024*1024)return new File([blob],file.name.replace(/\.[^.]*$/,'')+'.jpg',{type:'image/jpeg'});
    }
    throw new Error('FILE_TOO_LARGE');
  }finally{image.close();}
}

'use client';
import {useEffect} from 'react';
export function JobBoardReturn({authenticated}:{authenticated:boolean}) {
 useEffect(()=>{if(!authenticated)return;try{const path=sessionStorage.getItem('jumbo-board-return');if(path&&/^\/jobs(?:\/[a-f0-9-]{36}|\/new|\/mine)?$/.test(path)){sessionStorage.removeItem('jumbo-board-return');window.location.assign(path);}}catch{}},[authenticated]);
 return null;
}

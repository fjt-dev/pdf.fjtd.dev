// SPDX-License-Identifier: AGPL-3.0-or-later
import {actions} from './engine.mjs';
self.onmessage=async({data:{id,action,args}})=>{try{if(!actions[action])throw Error('未対応の操作です。');const result=await actions[action](args);self.postMessage({id,result})}catch(e){self.postMessage({id,error:e.message||'PDFを処理できませんでした。'})}};

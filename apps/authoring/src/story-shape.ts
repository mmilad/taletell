export type StoryRange = { min:number; max:number };
export type StoryShape = {
  pageCount:number;
  paragraphCount:StoryRange;
  paragraphWords:StoryRange;
};

export const DEFAULT_STORY_SHAPE:StoryShape = {
  pageCount:8,
  paragraphCount:{min:1,max:2},
  paragraphWords:{min:18,max:40}
};

export function clamp(value:number,min:number,max:number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max,Math.max(min,Math.round(value)));
}

function orderedRange(min:number,max:number,lo:number,hi:number):StoryRange {
  const a=clamp(min,lo,hi);
  const b=clamp(max,lo,hi);
  return a<=b?{min:a,max:b}:{min:b,max:a};
}

export type StoryShapeInput = {
  pageCount?:number;
  paragraphsMin?:number;
  paragraphsMax?:number;
  paragraphWordsMin?:number;
  paragraphWordsMax?:number;
};

export function normalizeStoryShape(input?:StoryShapeInput):StoryShape {
  return {
    pageCount:clamp(input?.pageCount??DEFAULT_STORY_SHAPE.pageCount,2,16),
    paragraphCount:orderedRange(
      input?.paragraphsMin??DEFAULT_STORY_SHAPE.paragraphCount.min,
      input?.paragraphsMax??DEFAULT_STORY_SHAPE.paragraphCount.max,
      1,6
    ),
    paragraphWords:orderedRange(
      input?.paragraphWordsMin??DEFAULT_STORY_SHAPE.paragraphWords.min,
      input?.paragraphWordsMax??DEFAULT_STORY_SHAPE.paragraphWords.max,
      6,80
    )
  };
}

export function wordCount(text:string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function splitParagraphs(text:string) {
  return text.split(/\n{2,}/).map(part=>part.replace(/\s+/g,' ').trim()).filter(Boolean);
}

function sentencesOf(text:string) {
  const cleaned=text.replace(/\s+/g,' ').trim();
  if (!cleaned) return [];
  const parts=cleaned.split(/(?<=[.!?])\s+/).map(part=>part.trim()).filter(Boolean);
  return parts.length?parts:[cleaned];
}

function ensureSentence(text:string) {
  const trimmed=text.trim().replace(/[,:;]+$/,'');
  if (!trimmed) return 'They went on.';
  return /[.!?]$/.test(trimmed)?trimmed:`${trimmed}.`;
}

function trimToWords(text:string,max:number) {
  const sentences=sentencesOf(ensureSentence(text));
  const kept:string[]=[];
  let count=0;
  for (const sentence of sentences) {
    const next=wordCount(sentence);
    if (count+next>max) break;
    kept.push(sentence);
    count+=next;
  }
  if (kept.length) return ensureSentence(kept.join(' '));
  return ensureSentence(ensureSentence(text).split(/\s+/).filter(Boolean).slice(0,max).join(' '));
}

function splitClause(sentence:string) {
  const parts=sentence.split(/(?:,\s+|\s+and\s+)/).map(part=>part.trim()).filter(Boolean);
  if (parts.length<2) return [sentence];
  const mid=Math.ceil(parts.length/2);
  return [parts.slice(0,mid).join(', '),parts.slice(mid).join(', ')];
}

function unitsForParagraphs(text:string,target:number) {
  let units=sentencesOf(text);
  let guard=0;
  while (units.length<target&&guard<8) {
    const longest=units.reduce((best,unit,index)=>wordCount(unit)>wordCount(units[best])?index:best,0);
    const split=splitClause(units[longest]||'');
    if (split.length<2||split.some(part=>wordCount(part)<3)) break;
    units.splice(longest,1,...split.map(part=>ensureSentence(part)));
    guard+=1;
  }
  return units;
}

function mergeParagraphs(paragraphs:string[],count:number) {
  const next=paragraphs.slice();
  while (next.length>count&&next.length>1) {
    const last=next.pop()||'';
    next[next.length-1]=`${next[next.length-1]} ${last}`.trim();
  }
  return next;
}

function chunkSentences(sentences:string[],count:number) {
  const buckets:string[][]=Array.from({length:count},()=>[]);
  if (!sentences.length) return buckets;
  const size=Math.max(1,Math.ceil(sentences.length/count));
  sentences.forEach((sentence,index)=>{
    buckets[Math.min(count-1,Math.floor(index/size))].push(sentence);
  });
  return buckets.filter(group=>group.length);
}

export function shapeSceneProse(text:string,shape:StoryShape):string {
  let paragraphs=splitParagraphs(text);
  if (!paragraphs.length&&text.trim()) paragraphs=[text.trim()];
  if (paragraphs.length<shape.paragraphCount.min) {
    const units=unitsForParagraphs(paragraphs.join(' '),shape.paragraphCount.min);
    paragraphs=units.length>=shape.paragraphCount.min
      ?chunkSentences(units,shape.paragraphCount.min).map(group=>group.join(' '))
      :paragraphs;
  }
  if (paragraphs.length>shape.paragraphCount.max) paragraphs=mergeParagraphs(paragraphs,shape.paragraphCount.max);
  return paragraphs
    .map(paragraph=>{
      const cleaned=ensureSentence(paragraph);
      return wordCount(cleaned)>shape.paragraphWords.max?trimToWords(cleaned,shape.paragraphWords.max):cleaned;
    })
    .join('\n\n');
}

export function fitPages<T>(beats:T[],pageCount:number):T[] {
  if (!beats.length||beats.length===pageCount) return beats;
  if (pageCount===1) return [beats[0]];
  if (beats.length>pageCount) {
    const last=beats[beats.length-1];
    const inner=beats.slice(0,-1);
    const picked=Array.from({length:pageCount-1},(_,index)=>{
      const at=Math.round(index*(inner.length-1)/Math.max(pageCount-2,1));
      return inner[at];
    });
    return [...picked,last];
  }
  const result=beats.slice();
  let extra=pageCount-beats.length;
  let at=1;
  while (extra>0) {
    const prev=result[Math.max(0,at-1)];
    result.splice(at,0,prev);
    extra-=1;
    at+=2;
    if (at>=result.length) at=1;
  }
  return result;
}

export function describeStoryShape(shape:StoryShape) {
  const last=shape.pageCount;
  const open=Math.max(1,Math.round(last*0.25));
  const close=Math.max(open+1,last-Math.max(1,Math.round(last*0.25)));
  const pages=`Write exactly ${last} picture-book pages in scenes[].`;
  const paragraphs=shape.paragraphCount.min===shape.paragraphCount.max
    ?`Each scenes[].sourceText must contain exactly ${shape.paragraphCount.min} paragraph${shape.paragraphCount.min===1?'':'s'}.`
    :`Each scenes[].sourceText must contain ${shape.paragraphCount.min} to ${shape.paragraphCount.max} paragraphs.`;
  const words=`Separate paragraphs with a blank line. Each paragraph must be ${shape.paragraphWords.min} to ${shape.paragraphWords.max} words. If a page needs more words, add a concrete action or detail that belongs on that page — never a refrain.`;
  const middleFrom=open+1;
  const middleTo=close-1;
  const middle=middleFrom<=middleTo
    ?`${middleFrom}–${middleTo} only the quest steps the premise asks for, one new step per page`
    :`the middle pages continue those quest steps, one new step per page`;
  const arc=last<=3
    ?`Tell the whole premise. The last page is the ending: they get what they came for and the story stops.`
    :`Use the pages as a finished book: 1–${open} ordinary world and the problem; ${middle}; ${close}–${last} they get what they came for, return, and stop. Page ${last} is the last page. Do not wander after the goal. Do not pad with empty feelings.`;
  return `${pages} ${paragraphs} ${words} ${arc}`;
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allCards, searchCards, rankScanCandidates, scanCandidates, needsScanRefinement } = require('../.test-build/lib/catalog');
const { cardCategory, cardKindLabel, isTagTeam, matchesCardFilter, pokemonIds } = require('../.test-build/lib/card-kind');
const { freshCollection, addCard, discoveredIds, totalCards, portableBackup, parseCollection } = require('../.test-build/lib/model');
const { identifyProgressively } = require('../.test-build/lib/scan-pipeline');
const brief = (id, language='en') => allCards.find(c => c.id===id && c.language===language);
const full = (id, fields={}) => ({ ...brief(id), category: cardCategory(brief(id)), set:{id:'test',name:'Test',total:200}, dexIds:[], types:[], rarity:'Rare', finishes:['unsure'], ...fields });
const scan = (topText, bottomText='') => ({text: `${topText}\n${bottomText}`,topText,bottomText,photoUri:'file:///test.jpg',crop:[0,0,1,1],autoCropped:false});

test('all physical cards have a category; type filters include Trainer subtypes and TAG TEAM Supporters', () => {
  assert.ok(allCards.every(c => cardCategory(c)!=='Card'));
  assert.equal(cardCategory(brief('base1-94')), 'Trainer');
  assert.equal(cardKindLabel(brief('sm9-156')), 'Trainer · Stadium');
  assert.equal(cardKindLabel(brief('SV5a-056','ja')), 'Trainer · Item');
  assert.equal(cardCategory(brief('base1-99')), 'Energy');
  assert.ok(isTagTeam(brief('sm9-33')));
  assert.ok(matchesCardFilter(brief('sm12-234'),'tagteam'));
  assert.ok(matchesCardFilter(brief('sm12-234'),'trainer'));
  assert.ok(!matchesCardFilter(brief('sm12-234'),'pokemon'));
  assert.ok(searchCards('', 'en', 80, 'stadium').every(c => matchesCardFilter(c,'stadium')));
  assert.ok(searchCards('Grass Energy', 'en', 80, 'energy').every(c => cardCategory(c)==='Energy'));
});
test('Trainer and Energy cards count in the binder without unlocking incidental Pokémon IDs', () => {
  let t=freshCollection().trainers[0];
  for(const id of ['base1-94','base1-99','sm9-156','sm12-234']) t=addCard(t,full(id,{dexIds:[25]}),'unsure',1);
  assert.equal(totalCards(t),4);
  assert.deepEqual([...discoveredIds(t)],[]);
});
test('two- and three-Pokémon TAG TEAM cards unlock all partners while counting each physical card once', () => {
  let t=addCard(freshCollection().trainers[0],full('sm9-33',{dexIds:[25,644]}),'unsure',1);
  t=addCard(t,full('sm12-221',{dexIds:[493,483,484]}),'unsure',2);
  assert.equal(totalCards(t),3);
  assert.deepEqual([...discoveredIds(t)].sort((a,b)=>a-b),[25,483,484,493,644]);
  assert.deepEqual(pokemonIds(full('sm9-33',{dexIds:[25,25,644]})),[25,644]);
});
test('backup preserves subtype metadata and restores older cards without it', () => {
  const c=freshCollection();c.trainers[0]=addCard(c.trainers[0],full('sm12-234',{trainerType:'Supporter',tagTeam:true}),'unsure',1);
  const restored=parseCollection(portableBackup(c));assert.equal(restored.trainers[0].entries[0].card.tagTeam,true);
  assert.equal(restored.trainers[0].entries[0].card.trainerType,'Supporter');
  delete c.trainers[0].entries[0].card.tagTeam;delete c.trainers[0].entries[0].card.trainerType;
  assert.equal(cardKindLabel(parseCollection(portableBackup(c)).trainers[0].entries[0].card),'TAG TEAM · Trainer · Supporter');
});
test('category labels and split partner names help exact printing matches', () => {
  for(const [language, top, footer, id] of [
    ['en','TRAINER\nPotion','94/102','base1-94'],
    ['en','ENERGY','99/102','base1-99'],
    ['en','TRAINER\nSTADIUM\nViridian Forest','156/181','sm9-156'],
    ['en','TAG TEAM\nPikachu\nZekrom GX','33/181','sm9-33'],
    ['en','TAG TEAM\nArceus\nDialga\nPalkia GX','221/236','sm12-221'],
    ['en','TAG TEAM\nSUPPORTER\nRed & Blue','234/236','sm12-234'],
    ['ja','グッズ\nポケモンいれかえ','SV5a 056/066','SV5a-056'],
  ]) assert.equal(rankScanCandidates(scan(top,footer),language)[0]?.id,id,id);
  assert.deepEqual(rankScanCandidates(scan('ENERGY'), 'en'),[]);
});
test('clear scans publish after the fast pass and skip refinement and artwork downloads', async () => {
  const phases=[];
  await identifyProgressively({recognize:async()=>scan('Pikachu','58/102'),refine:async()=>{throw Error('must not refine')},compare:async()=>{throw Error('must not compare')}},
    {uri:'photo',language:'en',filter:'all'},(_,matches,phase)=>phases.push([matches[0].card.id,phase]),()=>true);
  assert.deepEqual(phases,[['base1-58','done']]);
  assert.equal(needsScanRefinement(scanCandidates(scan('Pikachu','58/102'),'en')),false);
});
test('uncertain scans publish before slow optional work; replacing a scan suppresses stale results', async () => {
  let release;const extra=new Promise(resolve=>release=resolve);let current=true;const phases=[];
  const work=identifyProgressively({recognize:async()=>scan('Pikachu'),refine:()=>extra,compare:async(_,c)=>c},
    {uri:'photo',language:'en',filter:'all'},(_,matches,phase)=>phases.push([matches.length,phase]),()=>current);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(phases[0][1],'refining');assert.ok(phases[0][0]>0);
  current=false;release(scan('Pikachu','58/102'));await work;
  assert.equal(phases.length,1);
});
test('failed optional refinement and artwork downloads preserve initial matches', async () => {
  const phases=[];
  await identifyProgressively({recognize:async()=>scan('Pikachu'),refine:async()=>{throw Error('unavailable')},compare:async()=>{throw Error('offline')}},
    {uri:'photo',language:'en',filter:'all'},(_,matches,phase)=>phases.push([matches.map(m=>m.card.id),phase]),()=>true);
  assert.equal(phases.at(-1)[1],'done');assert.deepEqual(phases.at(-1)[0],phases[0][0]);
});
test('fast native output keeps the expected printing first across eleven reference/layout cases', () => {
  for (const fixture of require('./fixtures/scan-fast-text.json')) {
    assert.equal(rankScanCandidates(fixture.scan,fixture.language)[0]?.id,fixture.expected,fixture.label);
  }
});

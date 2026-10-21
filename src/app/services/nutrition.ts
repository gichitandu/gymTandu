import { MealIngredient } from '../models/domain';
// Approximate reference values per 100g, always editable; not inferred from pixels.
export const FOODS=[
 {id:'banana',name:'Banana',match:/^banana$/i,kcal:89,protein:1.1,carbs:22.8,fat:.3},
 {id:'apple',name:'Mela',match:/^(granny smith|apple)$/i,kcal:52,protein:.3,carbs:13.8,fat:.2},
 {id:'orange',name:'Arancia',match:/^orange$/i,kcal:47,protein:.9,carbs:11.8,fat:.1},
 {id:'strawberry',name:'Fragole',match:/^strawberry$/i,kcal:32,protein:.7,carbs:7.7,fat:.3},
 {id:'broccoli',name:'Broccoli',match:/^broccoli$/i,kcal:34,protein:2.8,carbs:6.6,fat:.4},
 {id:'pizza',name:'Pizza (ricetta generica)',match:/^pizza$/i,kcal:266,protein:11,carbs:33,fat:10},
 {id:'pasta',name:'Pasta cotta, senza condimento',match:/^(spaghetti|pasta)$/i,kcal:158,protein:5.8,carbs:30.9,fat:.9},
 {id:'rice',name:'Riso cotto, senza condimento',match:/^rice$/i,kcal:130,protein:2.7,carbs:28.2,fat:.3},
 {id:'chicken',name:'Petto di pollo cotto',match:/^(cooked chicken breast|chicken breast)$/i,kcal:165,protein:31,carbs:0,fat:3.6},
 {id:'egg',name:'Uovo intero',match:/^(cooked egg|boiled egg)$/i,kcal:143,protein:12.6,carbs:.7,fat:9.5},
 {id:'salmon',name:'Salmone',match:/^(cooked salmon|salmon fillet)$/i,kcal:208,protein:20,carbs:0,fat:13},
 {id:'bread',name:'Pane bianco',match:/^(french loaf|white bread)$/i,kcal:265,protein:9,carbs:49,fat:3.2},
 {id:'yogurt',name:'Yogurt bianco intero',match:/^(plain yogurt|yogurt)$/i,kcal:61,protein:3.5,carbs:4.7,fat:3.3},
 {id:'cauliflower',name:'Cavolfiore',match:/^cauliflower$/i,kcal:25,protein:1.9,carbs:5,fat:.3},
 {id:'bell-pepper',name:'Peperone',match:/^bell pepper$/i,kcal:31,protein:1,carbs:6,fat:.3},
 {id:'pineapple',name:'Ananas',match:/^pineapple$/i,kcal:50,protein:.5,carbs:13.1,fat:.1},
 {id:'cucumber',name:'Cetriolo',match:/^cucumber$/i,kcal:15,protein:.7,carbs:3.6,fat:.1},
 {id:'zucchini',name:'Zucchine',match:/^zucchini$/i,kcal:17,protein:1.2,carbs:3.1,fat:.3},
 {id:'corn',name:'Mais cotto',match:/^corn$/i,kcal:96,protein:3.4,carbs:21,fat:1.5},
 {id:'carbonara',name:'Pasta alla carbonara (ricetta generica)',match:/^carbonara$/i,kcal:220,protein:9,carbs:24,fat:10},
 {id:'bagel',name:'Bagel semplice',match:/^bagel$/i,kcal:277,protein:10.7,carbs:53,fat:1.6},
 {id:'mashed-potato',name:'Purè di patate (ricetta generica)',match:/^mashed potato$/i,kcal:113,protein:1.9,carbs:16.8,fat:4.2},
 {id:'guacamole',name:'Guacamole (ricetta generica)',match:/^guacamole$/i,kcal:150,protein:2,carbs:8,fat:13},
];
export function portion(food:typeof FOODS[number],grams:number){if(!Number.isFinite(grams)||grams<=0||grams>10000)throw Error('Quantità non valida.');return {calories:Math.round(food.kcal*grams/100),protein:+(food.protein*grams/100).toFixed(1),carbs:+(food.carbs*grams/100).toFixed(1),fat:+(food.fat*grams/100).toFixed(1)};}
export function foodSuggestions(predictions:{label:string;probability:number}[]){
 // ImageNet names may contain comma-separated synonyms. Match the complete
 // primary class, never a substring: e.g. triceratops is not rice and a live
 // prairie chicken is not a cooked chicken breast. Scores only rank proposals;
 // quantities and nutritional values still require the user's confirmation.
 const candidates=predictions.filter(p=>typeof p.label==='string'&&Number.isFinite(p.probability)&&p.probability>=.15&&p.probability<=1)
  .map(p=>({label:p.label.split(',')[0].trim().replace(/\s+/g,' '),probability:p.probability}));
 return FOODS.map(food=>({food,score:Math.max(0,...candidates.filter(p=>food.match.test(p.label)).map(p=>p.probability))}))
  .filter(candidate=>candidate.score>=.15).sort((a,b)=>b.score-a.score).map(candidate=>candidate.food);
}

export function sumIngredients(items:MealIngredient[]){
 if(!items.length||items.length>30)throw Error('Aggiungi da 1 a 30 alimenti.');
 const totals={grams:0,calories:0,protein:0,carbs:0,fat:0};
 for(const item of items){if(!item.name.trim()||!Number.isFinite(item.grams)||item.grams<=0||item.grams>10000||[item.calories,item.protein,item.carbs,item.fat].some((n,i)=>!Number.isFinite(n)||n<0||n>[20000,2000,3000,2000][i]))throw Error('Controlla quantità e valori degli alimenti.');for(const key of Object.keys(totals) as (keyof typeof totals)[])totals[key]+=item[key];}
 for(const key of Object.keys(totals) as (keyof typeof totals)[])totals[key]=Math.round(totals[key]*10)/10;
 if(totals.grams>10000||totals.calories>20000||totals.protein>2000||totals.carbs>3000||totals.fat>2000)throw Error('Il totale del pasto supera i limiti consentiti.');
 return totals;
}
export function resizeIngredient(item:MealIngredient,grams:number):MealIngredient{
 if(!Number.isFinite(grams)||grams<=0||grams>10000||item.grams<=0)throw Error('Quantità non valida.');
 const ratio=grams/item.grams;
 return {...item,grams,calories:Math.round(item.calories*ratio*10)/10,protein:Math.round(item.protein*ratio*10)/10,carbs:Math.round(item.carbs*ratio*10)/10,fat:Math.round(item.fat*ratio*10)/10};
}

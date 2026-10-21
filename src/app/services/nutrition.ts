// Approximate reference values per 100g, always editable; not inferred from pixels.
export const FOODS=[
 {id:'banana',name:'Banana',match:/banana/i,kcal:89,protein:1.1,carbs:22.8,fat:.3},
 {id:'apple',name:'Mela',match:/granny smith|apple/i,kcal:52,protein:.3,carbs:13.8,fat:.2},
 {id:'orange',name:'Arancia',match:/orange/i,kcal:47,protein:.9,carbs:11.8,fat:.1},
 {id:'strawberry',name:'Fragole',match:/strawberry/i,kcal:32,protein:.7,carbs:7.7,fat:.3},
 {id:'broccoli',name:'Broccoli',match:/broccoli/i,kcal:34,protein:2.8,carbs:6.6,fat:.4},
 {id:'pizza',name:'Pizza (ricetta generica)',match:/pizza/i,kcal:266,protein:11,carbs:33,fat:10},
 {id:'pasta',name:'Pasta cotta, senza condimento',match:/spaghetti|carbonara/i,kcal:158,protein:5.8,carbs:30.9,fat:.9},
 {id:'rice',name:'Riso cotto, senza condimento',match:/rice/i,kcal:130,protein:2.7,carbs:28.2,fat:.3},
 {id:'chicken',name:'Petto di pollo cotto',match:/chicken/i,kcal:165,protein:31,carbs:0,fat:3.6},
 {id:'egg',name:'Uovo intero',match:/egg/i,kcal:143,protein:12.6,carbs:.7,fat:9.5},
 {id:'salmon',name:'Salmone',match:/salmon/i,kcal:208,protein:20,carbs:0,fat:13},
 {id:'bread',name:'Pane bianco',match:/french loaf|bagel/i,kcal:265,protein:9,carbs:49,fat:3.2},
 {id:'yogurt',name:'Yogurt bianco intero',match:/yogurt/i,kcal:61,protein:3.5,carbs:4.7,fat:3.3},
];
export function portion(food:typeof FOODS[number],grams:number){if(!Number.isFinite(grams)||grams<=0||grams>10000)throw Error('Quantità non valida.');return {calories:Math.round(food.kcal*grams/100),protein:+(food.protein*grams/100).toFixed(1),carbs:+(food.carbs*grams/100).toFixed(1),fat:+(food.fat*grams/100).toFixed(1)};}
export function foodSuggestions(predictions:{label:string;probability:number}[]){return FOODS.filter(f=>predictions.some(p=>p.probability>=.15&&f.match.test(p.label)));}

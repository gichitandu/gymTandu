import { Exercise, MuscleGroup } from "../models/domain";
export const defaultGroups: MuscleGroup[] = [
  {
    "id": "muscle-0",
    "name": "Petto"
  },
  {
    "id": "muscle-1",
    "name": "Schiena"
  },
  {
    "id": "muscle-2",
    "name": "Spalle"
  },
  {
    "id": "muscle-3",
    "name": "Gambe"
  },
  {
    "id": "muscle-4",
    "name": "Braccia"
  },
  {
    "id": "muscle-5",
    "name": "Core"
  },
  {
    "id": "muscle-6",
    "name": "Glutei"
  },
  {
    "id": "muscle-7",
    "name": "Polpacci"
  }
];
export const defaultExercises: Exercise[] = [
  {
    "id": "exercise-0",
    "name": "Panca piana",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-1",
    "name": "Panca inclinata con manubri (angolo libero)",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-2",
    "name": "Croci ai cavi",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-3",
    "name": "Chest press",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-4",
    "name": "Lat machine",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-5",
    "name": "Rematore bilanciere",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-6",
    "name": "Pulley",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-7",
    "name": "Trazioni alla sbarra",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Sbarra",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-8",
    "name": "Shoulder press",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-9",
    "name": "Alzate laterali",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-10",
    "name": "Alzate posteriori",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-11",
    "name": "Squat",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-12",
    "name": "Leg press",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-13",
    "name": "Leg extension",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-14",
    "name": "Leg curl",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-15",
    "name": "Stacco rumeno",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-16",
    "name": "Curl bilanciere",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-17",
    "name": "Curl manubri",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-18",
    "name": "Pushdown cavo",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-19",
    "name": "French press",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "exercise-20",
    "name": "Crunch",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_incline_bench_press",
    "name": "Panca inclinata bilanciere",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_decline_barbell_bench_press",
    "name": "Panca declinata",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_dumbbell_bench_press",
    "name": "Panca piana con manubri (0°)",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_dumbbell_flyes",
    "name": "Croci manubri",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_incline_dumbbell_flyes",
    "name": "Croci su panca inclinata",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_butterfly",
    "name": "Pectoral machine",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_push_ups",
    "name": "Piegamenti a terra",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_diamond_push_ups",
    "name": "Piegamenti a presa stretta",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_straight_arm_dumbbell_pullover",
    "name": "Pullover manubrio",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_dip_machine",
    "name": "Dip alla macchina",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Petto"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_deadlift",
    "name": "Stacco da terra",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_one_arm_dumbbell_row",
    "name": "Rematore manubrio",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_close_grip_front_lat_pulldown",
    "name": "Lat machine presa stretta",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_straight_arm_pulldown",
    "name": "Pulldown braccia tese",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_leverage_iso_row",
    "name": "Rematore alla macchina",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_landmine_t_bar_row",
    "name": "T-bar row",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_inverted_row",
    "name": "Rematore a corpo libero",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_back_extension",
    "name": "Estensioni lombari",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_one_arm_lat_pulldown",
    "name": "Lat machine unilaterale",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_shrug",
    "name": "Scrollate bilanciere",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Schiena"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_overhead_press",
    "name": "Military press",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_arnold_press",
    "name": "Arnold press",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_front_dumbbell_raise",
    "name": "Alzate frontali",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_face_pull",
    "name": "Face pull",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_reverse_machine_flyes",
    "name": "Reverse fly alla macchina",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_standing_low_pulley_deltoid_raise",
    "name": "Alzate laterali al cavo",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_shoulder_military_press",
    "name": "Shoulder press macchina",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_upright_row",
    "name": "Tirate al mento",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_external_rotation",
    "name": "Extrarotazioni con manubrio",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_front_squat",
    "name": "Front squat",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_db_goblet_squat",
    "name": "Goblet squat",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_bulgarian_split_squat",
    "name": "Squat bulgaro",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_lunges",
    "name": "Affondi con manubri",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_weighted_step_ups",
    "name": "Step-up con manubri",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_hack_squat",
    "name": "Hack squat",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_seated_leg_curl",
    "name": "Leg curl seduto",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_sumo_deadlift",
    "name": "Stacco sumo",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_thigh_adductor",
    "name": "Adductor machine",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_air_squats",
    "name": "Squat a corpo libero",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_reverse_lunges",
    "name": "Affondi indietro",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Gambe"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_db_hammer_curl",
    "name": "Hammer curl",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-ez_bar_preacher_curl",
    "name": "Curl panca Scott",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere EZ",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_incline_dumbbell_curl",
    "name": "Curl su panca inclinata",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_concentration_curls",
    "name": "Curl concentrato",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_standing_biceps_cable_curl",
    "name": "Curl al cavo",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_reverse_barbell_curl",
    "name": "Curl inverso",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_rope_overhead_triceps_extension",
    "name": "Estensioni tricipiti sopra la testa al cavo",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_db_overhead_tricep_extension",
    "name": "Estensioni tricipiti manubrio",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_tricep_dumbbell_kickback",
    "name": "Kickback tricipiti",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_close_grip_bench_press",
    "name": "Panca presa stretta",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_tricep_dips",
    "name": "Dip su panca",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_palms_up_dumbbell_wrist_curl_over_a_bench",
    "name": "Wrist curl avambracci",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_plank",
    "name": "Plank",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_side_plank",
    "name": "Plank laterale",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_reverse_crunches",
    "name": "Crunch inverso",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_bicycle_crunches",
    "name": "Bicycle crunch",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_leg_raises",
    "name": "Sollevamento gambe",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_crunch",
    "name": "Crunch al cavo",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_dead_bug",
    "name": "Dead bug",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_bird_dog",
    "name": "Bird dog",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_russian_twist",
    "name": "Russian twist",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_mountain_climbers",
    "name": "Mountain climber",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-ab_wheel_wall_rollout",
    "name": "Ab wheel alla parete",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Ruota addominali",
    "tags": [
      "Core"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_hip_thrust",
    "name": "Hip thrust",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Glutei"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-barbell_glute_bridge",
    "name": "Ponte glutei con bilanciere",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Glutei"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_glute_bridge",
    "name": "Ponte glutei",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Glutei"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_single_leg_glute_bridge",
    "name": "Ponte glutei su una gamba",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Glutei"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_one_legged_cable_kickback",
    "name": "Slanci glutei al cavo",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Glutei"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_thigh_abductor",
    "name": "Abductor machine",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Glutei"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-cable_pull_through",
    "name": "Pull-through al cavo",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Glutei"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_donkey_kicks",
    "name": "Donkey kick",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Glutei"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_standing_calf_raises",
    "name": "Calf raise in piedi",
    "muscleGroupId": "muscle-7",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Polpacci"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_seated_calf_raise",
    "name": "Calf raise seduto",
    "muscleGroupId": "muscle-7",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Polpacci"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-machine_calf_press_leg_press",
    "name": "Calf press alla leg press",
    "muscleGroupId": "muscle-7",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Polpacci"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-bodyweight_standing_calf_raise",
    "name": "Calf raise a corpo libero",
    "muscleGroupId": "muscle-7",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Polpacci"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "library-dumbbells_standing_dumbbell_calf_raise",
    "name": "Calf raise con manubri",
    "muscleGroupId": "muscle-7",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Polpacci"
    ],
    "active": true,
    "createdAt": "2026-10-20T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-15",
    "name": "Panca inclinata con manubri a 15°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 15° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "15°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-30",
    "name": "Panca inclinata con manubri a 30°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 30° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "30°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-45",
    "name": "Panca inclinata con manubri a 45°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 45° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "45°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-60",
    "name": "Panca inclinata con manubri a 60°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 60° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "60°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-decline-15",
    "name": "Panca declinata con manubri a −15°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a -15° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "-15°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-decline-30",
    "name": "Panca declinata con manubri a −30°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a -30° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "-30°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-neutral-0",
    "name": "Panca piana con manubri, presa neutra",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni i palmi rivolti uno verso l’altro. Imposta la panca a 0° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "0°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-neutral-30",
    "name": "Panca inclinata a 30° con manubri, presa neutra",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni i palmi rivolti uno verso l’altro. Imposta la panca a 30° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "30°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-neutral-45",
    "name": "Panca inclinata a 45° con manubri, presa neutra",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni i palmi rivolti uno verso l’altro. Imposta la panca a 45° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "45°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-alternate",
    "name": "Panca piana con manubri alternata",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Spingi un manubrio alla volta, mantenendo stabile il tronco. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-bench-single",
    "name": "Panca piana con un manubrio",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Esegui un lato alla volta senza ruotare il tronco. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-floor-press",
    "name": "Distensioni con manubri a terra",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Parti supino a terra; la superficie limita la discesa del gomito. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-squeeze-press",
    "name": "Squeeze press con manubri su panca piana",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni i manubri vicini durante la spinta. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-fly-0",
    "name": "Croci con manubri su panca piana (0°)",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 0° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "0°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-fly-30",
    "name": "Croci con manubri su panca a 30°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 30° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "30°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-db-fly-45",
    "name": "Croci con manubri su panca a 45°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 45° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Petto",
      "Variante",
      "45°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-barbell-bench-15",
    "name": "Panca inclinata con bilanciere a 15°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 15° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Petto",
      "Variante",
      "15°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-barbell-bench-30",
    "name": "Panca inclinata con bilanciere a 30°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 30° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Petto",
      "Variante",
      "30°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-barbell-bench-45",
    "name": "Panca inclinata con bilanciere a 45°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 45° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Petto",
      "Variante",
      "45°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-smith-bench-0",
    "name": "Panca al multipower piana (0°)",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 0° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Multipower",
    "tags": [
      "Petto",
      "Variante",
      "0°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-smith-bench-30",
    "name": "Panca al multipower a 30°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 30° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Multipower",
    "tags": [
      "Petto",
      "Variante",
      "30°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-smith-bench-45",
    "name": "Panca al multipower a 45°",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 45° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Multipower",
    "tags": [
      "Petto",
      "Variante",
      "45°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-cable-fly-low",
    "name": "Croci ai cavi dal basso verso l’alto",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Petto",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-cable-fly-high",
    "name": "Croci ai cavi dall’alto verso il basso",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Petto",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-incline-chest-machine",
    "name": "Chest press inclinata alla macchina",
    "muscleGroupId": "muscle-0",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Petto",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-lat-pronated-wide",
    "name": "Lat machine presa prona larga",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-lat-supinated",
    "name": "Lat machine presa supina",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-lat-neutral",
    "name": "Lat machine presa neutra",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-row-neutral",
    "name": "Pulley presa neutra stretta",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-row-wide",
    "name": "Pulley presa prona larga",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Schiena",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-pullup-neutral",
    "name": "Trazioni presa neutra",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Sbarra",
    "tags": [
      "Schiena",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-pullup-supinated",
    "name": "Trazioni presa supina",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Sbarra",
    "tags": [
      "Schiena",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-lateral-seated",
    "name": "Alzate laterali con manubri da seduto",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-lateral-cable-behind",
    "name": "Alzate laterali al cavo dietro il corpo",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Spalle",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-rear-fly-supported",
    "name": "Alzate posteriori con petto su panca",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-squat-high-bar",
    "name": "Squat con bilanciere alto",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-squat-low-bar",
    "name": "Squat con bilanciere basso",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-box-squat",
    "name": "Box squat con bilanciere",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-legpress-single",
    "name": "Leg press unilaterale",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-legpress-wide",
    "name": "Leg press piedi larghi",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-legpress-narrow",
    "name": "Leg press piedi stretti",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-legcurl-lying",
    "name": "Leg curl sdraiato",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-legextension-single",
    "name": "Leg extension unilaterale",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-lunge-walking",
    "name": "Affondi camminati con manubri",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-lunge-reverse",
    "name": "Affondi indietro con manubri",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-lunge-lateral",
    "name": "Affondi laterali con manubri",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-rdl-single",
    "name": "Stacco rumeno con un manubrio su una gamba",
    "muscleGroupId": "muscle-3",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Gambe",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-curl-alternate",
    "name": "Curl con manubri alternato",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-curl-seated",
    "name": "Curl con manubri da seduto",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-pushdown-rope",
    "name": "Pushdown con corda",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Braccia",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-pushdown-bar",
    "name": "Pushdown con barra dritta",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Braccia",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-pushdown-single",
    "name": "Pushdown al cavo unilaterale",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Cavi",
    "tags": [
      "Braccia",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-triceps-single",
    "name": "Estensioni tricipiti sopra la testa con un manubrio, unilaterali",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-hipthrust-single",
    "name": "Hip thrust con bilanciere a una gamba",
    "muscleGroupId": "muscle-6",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Bilanciere",
    "tags": [
      "Glutei",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-plank-shoulder-tap",
    "name": "Plank con tocco delle spalle",
    "muscleGroupId": "muscle-5",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Corpo libero",
    "tags": [
      "Core",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "bodyweight",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-calf-standing-single",
    "name": "Calf raise alla macchina in piedi unilaterale",
    "muscleGroupId": "muscle-7",
    "secondaryMuscleIds": [],
    "description": "Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Macchina",
    "tags": [
      "Polpacci",
      "Variante"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-row-supported-30",
    "name": "Rematore con manubri con petto su panca a 30°",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 30° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Schiena",
      "Variante",
      "30°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-row-supported-45",
    "name": "Rematore con manubri con petto su panca a 45°",
    "muscleGroupId": "muscle-1",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 45° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Schiena",
      "Variante",
      "45°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-shoulder-press-75",
    "name": "Spinte spalle con manubri da seduto a 75°",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 75° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle",
      "Variante",
      "75°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-shoulder-press-90",
    "name": "Spinte spalle con manubri da seduto a 90°",
    "muscleGroupId": "muscle-2",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 90° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Spalle",
      "Variante",
      "90°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-incline-curl-45",
    "name": "Curl con manubri su panca a 45°",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 45° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia",
      "Variante",
      "45°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-incline-curl-60",
    "name": "Curl con manubri su panca a 60°",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Imposta la panca a 60° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia",
      "Variante",
      "60°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-spider-curl-30",
    "name": "Spider curl con manubri su panca a 30°",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Appoggia il petto alla panca inclinata. Imposta la panca a 30° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia",
      "Variante",
      "30°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  },
  {
    "id": "variant-spider-curl-45",
    "name": "Spider curl con manubri su panca a 45°",
    "muscleGroupId": "muscle-4",
    "secondaryMuscleIds": [],
    "description": "Appoggia il petto alla panca inclinata. Imposta la panca a 45° rispetto al piano orizzontale. Mantieni un’esecuzione controllata e scegli un carico adatto al tuo livello. Il link video è facoltativo e può essere aggiunto da un amministratore.",
    "equipment": "Manubri",
    "tags": [
      "Braccia",
      "Variante",
      "45°"
    ],
    "active": true,
    "createdAt": "2026-10-21T00:00:00.000Z",
    "loadMode": "external",
    "videoUrl": "",
    "thumbnailUrl": ""
  }
];

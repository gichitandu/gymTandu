import { Component, input, signal } from "@angular/core";
@Component({
  selector: "gt-icon",
  standalone: true,
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="paths[designName() || name()] || paths['activity']" />
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        width: 22px;
        height: 22px;
        flex-shrink: 0;
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class IconComponent {
  designName = signal('');
  name = input("activity");
  paths: Record<string, string> = {
    bell:'M18 8a6 6 0 0 0-12 0v5l-2 4h16l-2-4V8M10 21h4M12 2V1',
    sliders:'M6 3v5m0 4v9M12 3v10m0 4v4M18 3v2m0 4v12M3 8h6v4H3zm6 5h6v4H9zm6-8h6v4h-6z',
    repeat:'M20 9a8 8 0 0 0-14-3L3 9m0-5v5h5m-4 6a8 8 0 0 0 14 3l3-3m0 5v-5h-5',
    heart:'M12 21 3 12a5.5 5.5 0 0 1 9-7 5.5 5.5 0 0 1 9 7z',
    layers:'m3 7 9-5 9 5-9 5zm0 5 9 5 9-5M3 17l9 5 9-5',
    muscle:'M7 9 4 12l1 7h14l1-7-3-3M7 9V5l3-2 3 2-2 3H8m5 2 3 3M8 15h8',
    strength:'M7 9 5 7l1-4 4 1-1 4 3 3M7 9l-3 4 1 6c4 3 11 3 15-1v-6l-2-4-4 1 1 4-3 2M7 15h4',
    scale:'M12 3v17M8 21h8M5 7h14M5 7l-3 8h6L5 7m14 0-3 8h6l-3-8',
    body:'M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0M3 8l9 3 9-3M12 11v6M8 22l4-5 4 5',
    ruler:'m5 3 16 16-4 4L1 7zm4 4-2 2m6 2-2 2m6 2-2 2',
    'chevron-down':'m5 9 7 7 7-7',
    'chevron-right':'m9 5 7 7-7 7',

    moon:"M20 15a9 9 0 0 1-11-11A9 9 0 1 0 20 15z",
    fire:"M12 3c1 4 6 5 6 11a6 6 0 0 1-12 0c0-3 2-5 4-7 0 3 1 4 2 4 2-2 2-5 0-8z",
    move:"M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4m10-8 4 4-4 4",
    more:"M5 12h.01M12 12h.01M19 12h.01",
    circle:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    minus:"M5 12h14",
    play:"m9 5 11 7-11 7z",
    copy:"M8 8h13v13H8zM16 8V3H3v13h5",
    edit:"m4 15-1 6 6-1L21 8l-6-6L4 15M12 5l6 6",
    close:"m6 6 12 12M6 18 18 6",
    note:"M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
    mail: "M3 5h18v14H3zM3 6l9 7 9-7",
    lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3",
    eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    "eye-off": "M3 3l18 18M10 5a12 12 0 0 1 2 0c7 0 10 7 10 7a18 18 0 0 1-4 5M6 6a20 20 0 0 0-4 6s3 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4",
    nutrition: "M5 2v7a3 3 0 0 0 6 0V2M8 2v20M18 2v20M18 2c-5 4-5 11 0 11",
    camera:"M3 6h4l2-3h6l2 3h4v15H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    settings:"M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
    palette:"M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4c-1-1 1-3 3-3h2a8 8 0 0 0-8-11M7 9h.01M12 6h.01M17 9h.01M6 14h.01",
    info:"M12 10v7M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
    plans:
      "M8 4H5a2 2 0 0 0-2 2v14h18V6a2 2 0 0 0-2-2h-3M8 2h8v5H8zM7 12h10M7 16h7",
    activity: "M2 12h4l3-8 6 16 3-8h4",
    chart: "M4 3v17h17M7 14l4-4 4 2 6-8",
    user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    plus: "M12 5v14M5 12h14",
    weight: "M3 8v8M6 5v14M18 5v14M21 8v8M6 12h12",
    trophy:
      "M8 3h8v5a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 0v6m-4 3h8m-4-3-3 3m3-3 3 3",
    calendar: "M4 5h16v16H4zM8 2v6m8-6v6M4 11h16",
    clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
    check: "m5 12 4 4L19 6",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    shield: "m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5z",
    bolt: "m13 2-9 12h7l-1 8 10-13h-7z",
    trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
    back: "m14 6-6 6 6 6",
    search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6",
    // GT Hub
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    wallet: "M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4 2 4M16 14h.01",
    cart: "M3 4h2l2 12h11l2-8H6M9 20h.01M17 20h.01",
    coffee: "M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 2v3M12 2v3",
    car: "M5 16v3M19 16v3M3 16h18v-4l-2-5H5l-2 5zM7 13h.01M17 13h.01",
    fuel: "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 11h10M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3",
    road: "M8 3 4 21M16 3l4 18M12 4v3M12 11v3M12 18v3",
    parking: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 17V7h4a3 3 0 0 1 0 6H9",
    gauge: "M4 18a9 9 0 1 1 16 0M12 14l4-5M12 14h.01",
    bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
    ticket: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10",
    users: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    piggy: "M19 10c0-3-3-5-7-5S5 7 5 10c0 1.7 1 3.2 2.5 4.2V18h3v-2h3v2h3v-3.8C18 13.2 19 11.7 19 10zM5 10H3M15 9h.01M10 5V3",
    target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
    share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5",
    link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
    upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
    file: "M6 2h8l5 5v15H6zM14 2v5h5M9 13h7M9 17h5",
    pin: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
    pin2: "M12 17v5M8 3h8l-1 6 3 4H6l3-4z",
    house: "m3 10 9-7 9 7v10H3zM9 21v-6h6v6",
    swap: "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
    out: "M7 17 17 7M8 7h9v9",
    sparkle: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 2v4M21 4h-4",
    tag: "M3 12V3h9l9 9-9 9zM8 8h.01",
    mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
    bank: "M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18",
    "trend-down": "M3 7l6 6 4-4 8 8M21 11v6h-6",
  };
}

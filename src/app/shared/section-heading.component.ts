import { Component, input } from "@angular/core";

/** A shared editorial heading for the personal workspace. Never used by login. */
@Component({
  selector: "gt-section-heading",
  standalone: true,
  template: `<header class="section-heading">
    <div class="heading-copy">
      <p class="heading-kicker">
        <span>{{ index() }}</span
        ><i aria-hidden="true"></i>{{ eyebrow() }}
      </p>
      <h1>{{ title() }}</h1>
      @if (description()) {
        <p class="heading-description">{{ description() }}</p>
      }
    </div>
    <div class="heading-actions"><ng-content /></div>
  </header>`,
  styles: [
    `
      :host {
        display: block;
        margin: 0 0 26px;
        min-width: 0;
      }
      .section-heading {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 18px;
        min-width: 0;
        padding: 9px 0 2px;
      }
      .heading-copy {
        min-width: 0;
      }
      .heading-kicker {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 13px;
        color: var(--muted);
        font-size: 10px;
        font-weight: 750;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        line-height: 1.45;
      }
      .heading-kicker span {
        font-variant-numeric: tabular-nums;
        color: var(--blue, #0675ff);
        letter-spacing: 0.06em;
      }
      .heading-kicker i {
        width: 28px;
        height: 1px;
        background: var(--line);
      }
      h1 {
        font-size: clamp(29px, 4.4vw, 46px);
        font-weight: 780;
        letter-spacing: -0.055em;
        line-height: 1.02;
        margin: 0;
        overflow-wrap: anywhere;
        color: var(--text);
      }
      .heading-description {
        font-size: 13px;
        line-height: 1.65;
        margin: 12px 0 0;
        color: var(--muted);
        max-width: 54ch;
      }
      .heading-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
        empty-cells: hide;
      }
      .heading-actions:empty {
        display: none;
      }
      @media (max-width: 600px) {
        :host {
          margin-bottom: 22px;
        }
        .section-heading {
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .heading-copy {
          flex: 1 1 190px;
        }
        .heading-kicker {
          font-size: 9px;
          letter-spacing: 0.1em;
          margin-bottom: 10px;
          gap: 8px;
        }
        .heading-description {
          font-size: 12px;
          line-height: 1.5;
          margin-top: 10px;
        }
        .heading-actions {
          max-width: 100%;
          flex-wrap: wrap;
        }
        h1 {
          font-size: 32px;
        }
      }
      @media (max-width: 350px) {
        h1 {
          font-size: 28px;
        }
        .heading-kicker i {
          width: 15px;
        }
      }
    `,
  ],
})
export class SectionHeadingComponent {
  index = input("01");
  eyebrow = input("Il tuo spazio");
  title = input("");
  description = input("");
}

import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { AuthService } from '../auth/auth.service';
import { ResumeBuildService } from './resume-build.service';

@Component({
  selector: 'app-build-result-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="result-page" *ngIf="pdfUrl(); else missing">
      <header class="result-header">
        <div>
          <p class="eyebrow">Your tailored resume</p>
          <h2 class="title">Ready to download</h2>
        </div>
        <div class="actions">
          <a class="primary-action" [href]="pdfUrl()" download="resume.pdf">Download PDF</a>
          <a class="secondary-action" routerLink="/tailor">Build another</a>
        </div>
      </header>

      <div class="preview">
        <iframe [src]="safePdfUrl()" title="Generated resume preview"></iframe>
      </div>
    </section>

    <ng-template #missing>
      <section class="result-page">
        <h2 class="title">We couldn't find that resume.</h2>
        <p class="fallback"><a routerLink="/tailor">Back to tailor</a></p>
      </section>
    </ng-template>
  `,
  styles: [
    `
      :host {
        --accent-1: #7a61ff;
        --accent-2: #4285f4;
        --ink: #f4f6ff;
      }
      .result-page {
        max-width: 60rem;
        margin: 0 auto;
        padding: 3rem 1.5rem;
        color: var(--ink);
      }
      .result-header {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 1.75rem;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.72rem;
        font-weight: 700;
        color: #b7a9ff;
        margin: 0 0 0.4rem;
      }
      .title {
        margin: 0;
        font-size: 1.7rem;
        font-weight: 700;
        color: var(--ink);
      }
      .actions {
        display: flex;
        gap: 0.75rem;
      }
      .primary-action,
      .secondary-action {
        display: inline-flex;
        align-items: center;
        padding: 0.65rem 1.3rem;
        border-radius: 0.7rem;
        font-weight: 600;
        text-decoration: none;
        font-size: 0.9rem;
        transition:
          transform 0.16s ease,
          box-shadow 0.16s ease,
          background 0.16s ease;
      }
      .primary-action {
        background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
        color: #fff;
        box-shadow: 0 12px 28px -14px rgba(66, 133, 244, 0.8);
      }
      .primary-action:hover {
        transform: translateY(-1px);
        box-shadow: 0 16px 32px -14px rgba(66, 133, 244, 0.9);
      }
      .secondary-action {
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(255, 255, 255, 0.06);
        color: var(--ink);
      }
      .secondary-action:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .preview {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.04);
        box-shadow: 0 30px 80px -42px rgba(0, 0, 0, 0.85);
      }
      .preview iframe {
        display: block;
        width: 100%;
        height: 80vh;
        border: 0;
      }
      .fallback a {
        color: #b7a9ff;
        font-weight: 600;
      }
    `,
  ],
})
export class BuildResultPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly resumeBuild = inject(ResumeBuildService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly pdfUrl = signal<string | null>(null);
  readonly safePdfUrl = signal<SafeResourceUrl | null>(null);

  ngOnInit(): void {
    const jobId = this.route.snapshot.paramMap.get('jobId');
    const userId = this.auth.user()?.id;

    if (!jobId || !userId) {
      return;
    }

    const url = this.resumeBuild.pdfUrl(userId, jobId);
    this.pdfUrl.set(url);
    this.safePdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }
}

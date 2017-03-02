import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';
import { RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { AppComponent } from './app.component';
import { VideosComponent } from './videos/videos.component';
import { VideoDetailsComponent } from './video-details/video-details.component';
import { InsightsComponent } from './insights/insights.component';
import { PageNotFoundComponent } from './page-not-found/page-not-found.component';

import { VideosService } from './videos.service';
import { CeilingPipe } from './ceiling.pipe';
import { TimecodePipe } from './timecode.pipe';

declare var Dropzone: any;

// Define the routes
const ROUTES = [
  {
    path: '',
    redirectTo: 'videos',
    pathMatch: 'full'
  },
  {
    path: 'videos',
    component: VideosComponent
  },
  {
    path: 'videos/:id/insights',
    component: VideoDetailsComponent
  },
  {
    path: 'insights',
    component: InsightsComponent
  },
  {
    path: '**',
    component: PageNotFoundComponent
  }
];

Dropzone.autoDiscover = false;

@NgModule({
  declarations: [
    AppComponent,
    VideosComponent,
    VideoDetailsComponent,
    InsightsComponent,
    PageNotFoundComponent,
    CeilingPipe,
    TimecodePipe
  ],
  imports: [
    NgbModule.forRoot(),
    BrowserModule,
    FormsModule,
    HttpModule,
    RouterModule.forRoot(ROUTES) // Add routes to the app
  ],
  providers: [VideosService],
  bootstrap: [AppComponent]
})
export class AppModule { }

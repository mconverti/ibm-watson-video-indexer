import { Router, ActivatedRoute, Params } from '@angular/router';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { VideosService } from '../videos.service';
import { Observable, Subscription } from 'rxjs/Rx';
declare var $: any;

@Component({
  selector: 'app-videos',
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  templateUrl: './video-details.component.html',
  styleUrls: ['./video-details.component.css'],
})
export class VideoDetailsComponent implements OnInit {
  static AUTO_REFRESH_INTERVAL: number = 5000;
  static DEFAULT_RESULTS_PAGE_SIZE: number = 10;

  video: any = {};
  videoId: string;

  results: any = { total: 0, results: [] };
  size: number = VideoDetailsComponent.DEFAULT_RESULTS_PAGE_SIZE;
  from: number = 0;
  search: string = '';
  lastSearch: string = '';
  loading: boolean = true;

  playingVideoTitle: string = '';
  playingVideoStart: number = 0;

  isDestroyed: boolean = false;
  timerSubscription: Subscription;

  constructor(private videosService: VideosService, private activatedRoute: ActivatedRoute, private location: Location) { }

  ngOnInit() {
    this.isDestroyed = false;
    this.loading = true;

    this.activatedRoute.params.subscribe((params: Params) => {
      this.videoId = params['id'];

      this.getVideo();
    });

    this.activatedRoute.queryParams.subscribe((queryParams: Params) => {
      this.search = queryParams['search'] || '';
      this.from = (!!queryParams['from'] && !isNaN(queryParams['from'])) ? +(queryParams['from']) : 0;
      this.size = (!!queryParams['size'] && !isNaN(queryParams['size'])) ? +(queryParams['size']) : VideoDetailsComponent.DEFAULT_RESULTS_PAGE_SIZE;

      this.searchVideoInsights({ resetPager: false, updateLocation: false });
    });

    $('#playerVideoInsightsModal').on('hidden.bs.modal', () => {
      $('#playerVideoInsights').attr('src', '')​;
    });

    $('#playerVideoInsights').on('loadedmetadata', () => {
      if (this.playingVideoStart > 0) {
        console.log('Seeking to: ' + this.playingVideoStart);
        $('#playerVideoInsights')[0].currentTime = this.playingVideoStart;
      }

      console.log('Starting playback');
      $('#playerVideoInsights')[0].play();
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (!!this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  public searchVideoInsights(options?: any): void {
    options = options || { resetPager: false, updateLocation: true };
    this.loading = true;
    this.lastSearch = this.search;

    if (!!options.resetPager) {
      this.from = 0;
    }

    if (!!options.updateLocation) {
      var queryParams = [];
      if (!!this.lastSearch) {
        queryParams.push(`search=${encodeURIComponent(this.lastSearch)}`);
      }

      if (!!this.from) {
        queryParams.push(`from=${this.from}`);
      }

      if (this.size !== VideoDetailsComponent.DEFAULT_RESULTS_PAGE_SIZE) {
        queryParams.push(`size=${this.size}`);
      }

      if (queryParams.length > 0) {
        this.location.go(`/videos/${this.videoId}/insights`, `?${queryParams.join('&')}`);
      } else {
        this.location.go(`/videos/${this.videoId}/insights`);
      }
    }

    this.refreshVideoInsights().subscribe(() => {
      this.loading = false;
    });
  }

  public next(event: any): void {
    if (this.hasNext()) {
      this.from += this.size;
      this.searchVideoInsights();
    }

    event.preventDefault();
  }

  public previous(event: any): void {
    if (this.hasPrevious()) {
      this.from -= this.size;
      this.searchVideoInsights();
    }

    event.preventDefault();
  }

  public hasPrevious(): boolean {
    return this.from > 0;
  }

  public hasNext(): boolean {
    return (this.from + this.size) < this.results.total;
  }

  public play(event: any, videoUrl: string, videoTitle: string, videoStart: number): void {
    this.playingVideoTitle = videoTitle;
    this.playingVideoStart = +videoStart || 0;

    $('#playerVideoInsightsModal').modal();

    console.log('Loading video');
    $('#playerVideoInsights')[0].src = videoUrl​​​​;
    $('#playerVideoInsights')[0].load();

    event.preventDefault();
  }

  private getVideo(): void {
    if (!!this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    this.videosService.getVideo(this.videoId).subscribe(video => {
      this.video = video;
      this.subscribeToData();
    });
  }

  private subscribeToData(): void {
    if (!this.isDestroyed && (this.video.state !== 'complete') && (this.video.state !== 'error')) {
      this.timerSubscription = Observable.timer(VideoDetailsComponent.AUTO_REFRESH_INTERVAL).first().subscribe(() => {
        this.getVideo();
        this.refreshVideoInsights();
      });
    }
  }

  private refreshVideoInsights() {
    var searchObservable = this.videosService.getVideoInsights(this.videoId, this.lastSearch, this.size, this.from);

    searchObservable.subscribe(results => {
      this.results = results;
      this.loading = false;
    });

    return searchObservable;
  }
}

import { Router, ActivatedRoute, Params } from '@angular/router';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { VideosService } from '../videos.service';
declare var $: any;

@Component({
  selector: 'app-videos',
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  templateUrl: './insights.component.html',
  styleUrls: ['./insights.component.css'],
})
export class InsightsComponent implements OnInit {
  static DEFAULT_RESULTS_PAGE_SIZE: number = 10;

  results: any = { total: 0, results: [] };
  size: number = InsightsComponent.DEFAULT_RESULTS_PAGE_SIZE;
  from: number = 0;
  search: string = '';
  loading: boolean = true;

  playingVideoTitle: string = '';
  playingVideoStart: number = 0;

  constructor(private videosService: VideosService, private activatedRoute: ActivatedRoute, private location: Location) { }

  ngOnInit() {
    this.loading = true;

    this.activatedRoute.queryParams.subscribe((queryParams: Params) => {
      this.search = queryParams['search'] || '';
      this.from = (!!queryParams['from'] && !isNaN(queryParams['from'])) ? +(queryParams['from']) : 0;
      this.size = (!!queryParams['size'] && !isNaN(queryParams['size'])) ? +(queryParams['size']) : InsightsComponent.DEFAULT_RESULTS_PAGE_SIZE;

      this.searchInsights({ resetPager: false, updateLocation: false });
    });

    $('#playerInsightsModal').on('hidden.bs.modal', () => {
      $('#playerInsights').attr('src', '')​;
    });

    $('#playerInsights').on('loadedmetadata', () => {
      if (this.playingVideoStart > 0) {
        console.log('Seeking to: ' + this.playingVideoStart);
        $('#playerInsights')[0].currentTime = this.playingVideoStart;
      }

      console.log('Starting playback');
      $('#playerInsights')[0].play();
    });
  }

  public searchInsights(options?: any): void {
    options = options || { resetPager: false, updateLocation: true };
    this.loading = true;

    if (!!options.resetPager) {
      this.from = 0;
    }

    if (!!options.updateLocation) {
      var queryParams = [];
      if (!!this.search) {
        queryParams.push(`search=${encodeURIComponent(this.search)}`);
      }

      if (!!this.from) {
        queryParams.push(`from=${this.from}`);
      }

      if (this.size !== InsightsComponent.DEFAULT_RESULTS_PAGE_SIZE) {
        queryParams.push(`size=${this.size}`);
      }

      if (queryParams.length > 0) {
        this.location.go('/insights', `?${queryParams.join('&')}`);
      } else {
        this.location.go('/insights');
      }
    }

    this.refreshInsights().subscribe(() => {
      this.loading = false;
    });
  }

  public next(event: any): void {
    if (this.hasNext()) {
      this.from += this.size;
      this.searchInsights();
    }

    event.preventDefault();
  }

  public previous(event: any): void {
    if (this.hasPrevious()) {
      this.from -= this.size;
      this.searchInsights();
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

    $('#playerInsightsModal').modal();

    console.log('Loading video');
    $('#playerInsights')[0].src = videoUrl​​​​;
    $('#playerInsights')[0].load();

    event.preventDefault();
  }

  private refreshInsights() {
    var searchObservable = this.videosService.getInsights(this.search, this.size, this.from);

    searchObservable.subscribe(results => {
      this.results = results;
      this.loading = false;
    });

    return searchObservable;
  }
}

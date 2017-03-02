/* tslint:disable:no-unused-variable */

import { TestBed, async, inject } from '@angular/core/testing';
import { VideosService } from './videos.service';

describe('VideosService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VideosService]
    });
  });

  it('should ...', inject([VideosService], (service: VideosService) => {
    expect(service).toBeTruthy();
  }));
});

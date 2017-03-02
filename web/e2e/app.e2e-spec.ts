import { WatsonVideoIndexSitePocPage } from './app.po';

describe('watson-video-index-site-poc App', function() {
  let page: WatsonVideoIndexSitePocPage;

  beforeEach(() => {
    page = new WatsonVideoIndexSitePocPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});

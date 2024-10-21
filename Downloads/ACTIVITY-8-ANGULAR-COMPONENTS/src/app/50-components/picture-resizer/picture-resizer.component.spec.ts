import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PictureResizerComponent } from './picture-resizer.component';

describe('PictureResizerComponent', () => {
  let component: PictureResizerComponent;
  let fixture: ComponentFixture<PictureResizerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PictureResizerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PictureResizerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

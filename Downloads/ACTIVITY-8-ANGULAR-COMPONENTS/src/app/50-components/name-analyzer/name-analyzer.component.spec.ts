import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NameAnalyzerComponent } from './name-analyzer.component';

describe('NameAnalyzerComponent', () => {
  let component: NameAnalyzerComponent;
  let fixture: ComponentFixture<NameAnalyzerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NameAnalyzerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NameAnalyzerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

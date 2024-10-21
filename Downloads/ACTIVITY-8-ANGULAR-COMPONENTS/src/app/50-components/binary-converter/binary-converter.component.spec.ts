import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BinaryConverterComponent } from './binary-converter.component';

describe('BinaryConverterComponent', () => {
  let component: BinaryConverterComponent;
  let fixture: ComponentFixture<BinaryConverterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BinaryConverterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BinaryConverterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

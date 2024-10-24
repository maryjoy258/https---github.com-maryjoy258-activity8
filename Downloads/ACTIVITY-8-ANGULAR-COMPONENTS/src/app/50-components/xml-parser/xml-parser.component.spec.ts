import { ComponentFixture, TestBed } from '@angular/core/testing';

import { XmlParserComponent } from './xml-parser.component';

describe('XmlParserComponent', () => {
  let component: XmlParserComponent;
  let fixture: ComponentFixture<XmlParserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [XmlParserComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(XmlParserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

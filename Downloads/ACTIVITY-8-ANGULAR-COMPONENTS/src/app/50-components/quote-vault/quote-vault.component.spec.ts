import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuoteVaultComponent } from './quote-vault.component';

describe('QuoteVaultComponent', () => {
  let component: QuoteVaultComponent;
  let fixture: ComponentFixture<QuoteVaultComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuoteVaultComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuoteVaultComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

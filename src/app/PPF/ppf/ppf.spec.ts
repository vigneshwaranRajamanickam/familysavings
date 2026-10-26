import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Ppf } from './ppf';

describe('Ppf', () => {
  let component: Ppf;
  let fixture: ComponentFixture<Ppf>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ppf],
    }).compileComponents();

    fixture = TestBed.createComponent(Ppf);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ResultService } from './result.service';

@Controller('result')
export class ResultController {
  constructor(private readonly resultService: ResultService) {}

  @Get(':id')
  async getEvaluationResult(@Param('id', ParseIntPipe) id: number) {
    return this.resultService.getEvaluationResult(id);
  }
}

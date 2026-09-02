import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FLOW_EDGE_CONDITIONS, FLOW_NODE_TYPES } from '../flow-graph.types';

// 그래프 하나가 무한정 커지면 렌더 결과도 그만큼 커진다. 편집 가능한 크기로 묶어 둔다.
const MAX_NODES = 200;
const MAX_EDGES = 400;

export class ArsFlowNodeDto {
  // DB 컬럼이 UUID 다. 여기서 막지 않으면 Prisma 단계에서 깨지고,
  // 사용자는 무엇이 잘못됐는지 알 수 없는 뭉개진 메시지만 받는다.
  @IsUUID()
  nodeId: string;

  @IsIn(FLOW_NODE_TYPES as unknown as string[])
  nodeType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  label: string;

  /** 노드 타입별 설정. 실제 형태 검증은 `node-config.parser` 가 한다. */
  @IsObject()
  config: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  posX?: number;

  @IsOptional()
  @IsInt()
  posY?: number;
}

export class ArsFlowEdgeDto {
  @IsUUID()
  edgeId: string;

  @IsUUID()
  fromNodeId: string;

  @IsUUID()
  toNodeId: string;

  @IsIn(FLOW_EDGE_CONDITIONS as unknown as string[])
  condition: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  digit?: string;
}

export class ReplaceArsFlowGraphDto {
  @IsUUID()
  entryNodeId: string;

  @IsArray()
  @ArrayMaxSize(MAX_NODES)
  @ValidateNested({ each: true })
  @Type(() => ArsFlowNodeDto)
  nodes: ArsFlowNodeDto[];

  @IsArray()
  @ArrayMaxSize(MAX_EDGES)
  @ValidateNested({ each: true })
  @Type(() => ArsFlowEdgeDto)
  edges: ArsFlowEdgeDto[];
}

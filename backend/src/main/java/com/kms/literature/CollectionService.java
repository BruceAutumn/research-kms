package com.kms.literature;

import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.literature.dto.CollectionDto;
import com.kms.literature.dto.CollectionRequest;
import com.kms.literature.dto.ReorderRequest;
import com.kms.paper.Paper;
import com.kms.paper.PaperRepository;
import com.kms.paper.PaperService;
import com.kms.paper.dto.PaperDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
public class CollectionService {
    private final CollectionRepository collectionRepository;
    private final CollectionItemRepository itemRepository;
    private final PaperRepository paperRepository;
    private final PaperService paperService;

    public CollectionService(CollectionRepository collectionRepository,
                             CollectionItemRepository itemRepository,
                             PaperRepository paperRepository,
                             PaperService paperService) {
        this.collectionRepository = collectionRepository;
        this.itemRepository = itemRepository;
        this.paperRepository = paperRepository;
        this.paperService = paperService;
    }

    public List<CollectionDto> list() {
        Long userId = CurrentUser.ID;
        List<Object[]> rows = collectionRepository.listWithCounts(userId);
        List<CollectionDto> result = new ArrayList<>();
        for (Object[] row : rows) {
            Collection c = (Collection) row[0];
            long count = row[1] == null ? 0 : ((Number) row[1]).longValue();
            result.add(new CollectionDto(c.getId(), c.getParentId(), c.getName(), c.getSortOrder(), count, c.getCreatedAt()));
        }
        return result;
    }

    @Transactional
    public CollectionDto create(CollectionRequest request) {
        if (request.getName() == null || request.getName().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Collection name is required.");
        }
        Long parentId = request.getParentId();
        if (parentId != null) {
            findCollection(parentId); // 校验存在且属于当前用户
        }
        Collection collection = new Collection();
        collection.setUserId(CurrentUser.ID);
        collection.setParentId(parentId);
        collection.setName(request.getName().trim());
        int nextOrder = collectionRepository
                .findByUserIdAndParentId(CurrentUser.ID, parentId).size();
        collection.setSortOrder(nextOrder);
        Collection saved = collectionRepository.save(collection);
        return new CollectionDto(saved.getId(), saved.getParentId(), saved.getName(), saved.getSortOrder(), 0, saved.getCreatedAt());
    }

    @Transactional
    public CollectionDto update(Long id, CollectionRequest request) {
        Collection collection = findCollection(id);
        if (request.getName() != null && !request.getName().isBlank()) {
            collection.setName(request.getName().trim());
        }
        if (request.getParentId() != null) {
            if (request.getParentId().equals(id)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Collection cannot be its own parent.");
            }
            findCollection(request.getParentId());
            collection.setParentId(request.getParentId());
        }
        Collection saved = collectionRepository.save(collection);
        return new CollectionDto(saved.getId(), saved.getParentId(), saved.getName(), saved.getSortOrder(), count(saved.getId()), saved.getCreatedAt());
    }

    @Transactional
    public void reorder(ReorderRequest request) {
        if (request.items() == null) return;
        for (ReorderRequest.ReorderItem item : request.items()) {
            if (item.id() == null) continue;
            Collection collection = findCollection(item.id());
            if (item.parentId() != null && !item.parentId().equals(item.id())) {
                findCollection(item.parentId());
                collection.setParentId(item.parentId());
            }
            collection.setSortOrder(item.sortOrder());
            collectionRepository.save(collection);
        }
    }

    @Transactional
    public void delete(Long id) {
        Collection collection = findCollection(id);
        collectionRepository.delete(collection); // 级联删除子 Collection 与 collection_item
    }

    @Transactional
    public List<PaperDto> addPapers(Long id, List<Long> paperIds) {
        Collection collection = findCollection(id);
        List<PaperDto> added = new ArrayList<>();
        if (paperIds == null) return added;
        for (Long paperId : paperIds) {
            if (paperId == null) continue;
            Paper paper = paperRepository.findByIdAndUserId(paperId, CurrentUser.ID).orElse(null);
            if (paper == null || paper.isTrashed()) continue;
            if (!itemRepository.existsByCollectionIdAndPaperId(id, paperId)) {
                CollectionItem item = new CollectionItem();
                item.setCollectionId(id);
                item.setPaperId(paperId);
                itemRepository.save(item);
            }
            added.add(paperService.toDto(paper));
        }
        return added;
    }

    @Transactional
    public void removePaper(Long id, Long paperId) {
        findCollection(id);
        itemRepository.deleteByCollectionIdAndPaperId(id, paperId);
    }

    public List<PaperDto> listPapers(Long id) {
        Collection collection = findCollection(id);
        List<Long> paperIds = collectionRepository.findPaperIds(collection.getId());
        if (paperIds.isEmpty()) return List.of();
        List<Paper> papers = paperRepository.findAllById(paperIds).stream()
                .filter(p -> !p.isTrashed())
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .toList();
        return papers.stream().map(paperService::toDto).toList();
    }

    private Collection findCollection(Long id) {
        return collectionRepository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Collection not found."));
    }

    private long count(Long id) {
        return itemRepository.findByCollectionId(id).size();
    }
}
